import {
  IMAGE_SIZES,
  imageEditSchema,
  MEDIA_TYPES,
  mediaListQuerySchema,
  mediaUpdateSchema,
} from '@cms/sdk';
import type {
  AdminMedia,
  ImageSizeName,
  MediaAdmission,
  RateRule,
  MediaContext,
  MediaType,
  Paginated,
} from '@cms/sdk';
import { can } from '@cms/sdk';
import type { Actor } from '#api/domain/auth/authorization';
import { authorize } from '#api/domain/auth/authorization';
import { toAdminMedia } from '#api/domain/media/media-mapper';
import type {
  ImageProcessor,
  MediaWrite,
  MediaRepository,
  MediaStorage,
  StoredVariant,
} from '#api/domain/media/ports';
import { sniffMediaType } from '#api/domain/media/sniff';
import type { Clock, HookDispatcher, IdGenerator } from '#api/domain/ports';
import type { RateLimitStore } from '#api/domain/security/ports';
import {
  conflict,
  forbidden,
  invalidInput,
  notFound,
  rateLimited,
  Errors,
} from '#api/shared/errors';
import { parseInput } from '#api/shared/validation';

export interface MediaServiceDeps {
  repository: MediaRepository;
  storage: MediaStorage;
  images: ImageProcessor;
  ids: IdGenerator;
  clock: Clock;
  hooks: HookDispatcher;
  limiter: Pick<RateLimitStore, 'hit'>;
  /** Largest accepted upload, in bytes. */
  maxBytes: number;
  limits: () => Promise<MediaAdmission>;
}

const uploadRule = (max: number) =>
  ({
    enabled: max > 0,
    max: Math.max(1, max),
    windowSeconds: 60 * 60,
    blockSeconds: 60 * 60,
    enforcement: 'block',
  }) as const satisfies RateRule;

/** Images re-encoded on upload; GIFs keep their animation and carry no camera metadata. */
const CLEANED: readonly MediaType[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
];

const sizeNames = Object.keys(IMAGE_SIZES) as ImageSizeName[];

/** A safe display name: path and control characters removed. */
const displayName = (name: string) =>
  name
    .replace(/^.*[\\/]/, '')
    // Control characters (U+0000–U+001F, U+007F) never belong in a display name.
    .replace(/\p{Cc}/gu, '')
    .trim()
    .slice(0, 255) || 'file';

/** The media library. */
export class MediaService {
  constructor(private readonly deps: MediaServiceDeps) {}

  get maxBytes() {
    return this.deps.maxBytes;
  }

  async list(query: unknown, actor: Actor): Promise<Paginated<AdminMedia>> {
    authorize(actor, 'media.upload');
    const { page, pageSize, month, ...filters } = parseInput(
      mediaListQuerySchema,
      query,
    );
    const [year, number] = month?.split('-').map(Number) ?? [];
    const { items, total } = await this.deps.repository.list({
      ...filters,
      uploaded:
        year && number
          ? {
              start: new Date(Date.UTC(year, number - 1, 1)),
              end: new Date(Date.UTC(year, number, 1)),
            }
          : undefined,
      page,
      pageSize,
    });
    return { items: items.map(toAdminMedia), total, page, pageSize };
  }

  async get(id: string, actor: Actor): Promise<AdminMedia> {
    authorize(actor, 'media.upload');
    return toAdminMedia(await this.require(id));
  }

  /** Previous/next files for the details screen and the entries that show this one. */
  async context(id: string, actor: Actor): Promise<MediaContext> {
    authorize(actor, 'media.upload');
    await this.require(id);
    const [{ newer, older }, usedIn] = await Promise.all([
      this.deps.repository.neighbors(id),
      // Writers list every entry anyway; others learn only of published ones.
      this.deps.repository.usedIn(id, 50, !can(actor, 'content.create')),
    ]);
    return { newerId: newer, olderId: older, usedIn };
  }

  /**
   * Stores an upload. Its type comes from its bytes, not the name or declared type; images are
   * cleaned of metadata and get resized copies.
   */
  async upload(
    bytes: Uint8Array,
    filename: string,
    actor: Actor,
  ): Promise<AdminMedia> {
    authorize(actor, 'media.upload');
    const limits = await this.deps.limits();
    if (
      limits.uploadsPerHour > 0 &&
      (await this.deps.limiter.hit(
        `mediaUpload:${actor.id}`,
        uploadRule(limits.uploadsPerHour),
        this.deps.clock.now(),
      ))
    )
      throw rateLimited(Errors.MediaUploadRate(limits.uploadsPerHour));
    if (bytes.byteLength === 0) throw invalidInput(Errors.MediaEmpty);
    if (bytes.byteLength > this.deps.maxBytes)
      throw invalidInput(Errors.MediaTooLarge(this.deps.maxBytes));
    const mime = sniffMediaType(bytes);
    if (!mime) throw invalidInput(Errors.MediaTypeUnsupported);

    const id = this.deps.ids.next();
    const now = this.deps.clock.now();
    const base = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${id}`;
    const storageKey = `${base}.${MEDIA_TYPES[mime]}`;
    const isImage = mime.startsWith('image/');

    let original = bytes;
    let size: { width: number; height: number } | null = null;
    const variants: Partial<Record<ImageSizeName, StoredVariant>> = {};
    const files: { key: string; bytes: Uint8Array }[] = [];
    const written: string[] = [];
    try {
      if (isImage) {
        size = await this.deps.images.dimensions(bytes).catch(() => {
          throw invalidInput(Errors.MediaTypeUnsupported);
        });
        if (CLEANED.includes(mime))
          original = await this.deps.images.clean(bytes, mime);
        for (const name of sizeNames) {
          if (size.width <= IMAGE_SIZES[name]) continue;
          const resized = await this.deps.images.resize(
            original,
            IMAGE_SIZES[name],
          );
          const key = `${base}-${name}.webp`;
          files.push({ key, bytes: resized.bytes });
          variants[name] = {
            key,
            width: resized.width,
            height: resized.height,
          };
        }
      }
      files.push({ key: storageKey, bytes: original });
      written.push(...files.map(({ key }) => key));
      const freeBytes = limits.freeSpaceMb * 1024 * 1024;
      const stored = await this.deps.storage.commit(files, freeBytes);
      if (stored === 'low_space') throw conflict(Errors.MediaStorageLow);
      if (stored === 'busy') throw conflict(Errors.MediaStorageBusy);
      const record: MediaWrite = {
        id,
        uploaderId: actor.id,
        filename: displayName(filename),
        mime,
        size: original.byteLength,
        width: size?.width ?? null,
        height: size?.height ?? null,
        alt: '',
        caption: '',
        storageKey,
        variants,
        createdAt: now,
      };
      await this.deps.repository.insert(record);
    } catch (error) {
      // Nothing half-stored stays behind.
      await this.deps.storage.remove(written).catch(() => undefined);
      throw error;
    }
    const media = toAdminMedia(await this.require(id));
    void this.deps.hooks.emit('media.uploaded', media);
    return media;
  }

  async update(id: string, input: unknown, actor: Actor): Promise<AdminMedia> {
    const media = await this.editable(id, actor);
    const changes = parseInput(mediaUpdateSchema, input);
    await this.deps.repository.update(media.id, changes);
    return toAdminMedia(await this.require(id));
  }

  /** Save edits as a copy so embedded originals and their immutable URLs remain intact. */
  async edit(id: string, input: unknown, actor: Actor): Promise<AdminMedia> {
    const media = await this.editable(id, actor);
    const changes = parseInput(imageEditSchema, input);
    if (!CLEANED.includes(media.mime))
      throw invalidInput(Errors.MediaTypeUnsupported);
    const file = await this.deps.storage.read(media.storageKey);
    if (!file) throw notFound(Errors.MediaNotFound);
    const bytes = new Uint8Array(await new Response(file.body).arrayBuffer());
    const size = await this.deps.images.dimensions(bytes);
    if (
      changes.crop &&
      (changes.crop.left + changes.crop.width > size.width ||
        changes.crop.top + changes.crop.height > size.height)
    )
      throw invalidInput(Errors.ImageCropInvalid);
    const edited = await this.deps.images.edit(bytes, changes).catch(() => {
      throw invalidInput(Errors.ImageCropInvalid);
    });
    const copy = await this.upload(
      edited,
      media.filename.replace(/\.[^.]+$/, '') + '-edited.webp',
      actor,
    );
    return this.update(
      copy.id,
      { alt: media.alt, caption: media.caption },
      actor,
    );
  }

  /** Deletes the file. Files still shown by entries need `force`. */
  async remove(id: string, force: boolean, actor: Actor): Promise<void> {
    const media = await this.editable(id, actor);
    if (media.usageCount > 0 && !force)
      throw conflict(Errors.MediaInUse(media.usageCount));
    await this.deps.repository.delete(id);
    await this.deps.storage.remove([
      media.storageKey,
      ...Object.values(media.variants).map((variant) => variant.key),
    ]);
    void this.deps.hooks.emit('media.deleted', toAdminMedia(media));
  }

  /** A stored file for serving; keys are opaque and unguessable per upload. */
  async file(key: string, range?: { start: number; end?: number }) {
    const match = /^\d{4}\/\d{2}\/([0-9a-f-]{36})(?:-[a-z]+)?\.[a-z0-9]+$/.exec(
      key,
    );
    if (!match || !(await this.deps.repository.exists(match[1]!))) return null;
    return this.deps.storage.read(key, range);
  }

  /** Own uploads need `media.upload`; other people's need `media.manage`. */
  private async editable(id: string, actor: Actor) {
    authorize(actor, 'media.upload');
    const media = await this.require(id);
    if (media.uploaderId !== actor.id && !can(actor, 'media.manage'))
      throw forbidden();
    return media;
  }

  private async require(id: string) {
    const media = await this.deps.repository.get(id);
    if (!media) throw notFound(Errors.MediaNotFound);
    return media;
  }
}
