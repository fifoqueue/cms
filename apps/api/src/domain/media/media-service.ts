import {
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
import { sanitizeSvg } from '#api/domain/media/svg';
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
import { withParams } from '#api/shared/errors';
import { parseInput } from '#api/shared/validation';
import { MediaProcessors } from '#api/domain/media/media-processors';
import { ImageSizes } from '#api/domain/media/image-sizes';
import type { StorageSettings } from '#api/domain/media/storage-settings';
import type { JobQueue } from '#api/domain/jobs/ports';
import type { MediaCleanup } from '#api/domain/media/media-cleanup';

export interface MediaServiceDeps {
  cleanup?: MediaCleanup;
  cleanupQueue?: Pick<JobQueue, 'enqueue'>;
  storageSettings?: StorageSettings;
  sizes?: ImageSizes;
  processors?: MediaProcessors;
  repository: MediaRepository;
  storage: MediaStorage;
  selectStorage?: (driver?: string) => Promise<{
    driver: string;
    storage: MediaStorage;
    url: (key: string) => string;
  }>;
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
  get storageSettings() {
    if (!this.deps.storageSettings) throw new Error(Errors.MediaDriverInvalid);
    return this.deps.storageSettings;
  }
  private derivatives = 0;
  private readonly processors: MediaProcessors;
  constructor(private readonly deps: MediaServiceDeps) {
    this.processors = deps.processors ?? new MediaProcessors();
    if (!deps.processors)
      this.processors.registerCore({
        process: ({ bytes, mime }) => deps.images.clean(bytes, mime),
      });
  }

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
    options?: { rateLimit?: boolean },
  ): Promise<AdminMedia> {
    authorize(actor, 'media.upload');
    if (options?.rateLimit === false) authorize(actor, 'tools.manage');
    const limits = await this.deps.limits();
    if (
      options?.rateLimit !== false &&
      limits.uploadsPerHour > 0 &&
      (await this.deps.limiter.hit(
        `mediaUpload:${actor.id}`,
        uploadRule(limits.uploadsPerHour),
        this.deps.clock.now(),
      ))
    )
      throw rateLimited(
        Errors.MediaUploadRate,
        withParams(Errors.MediaUploadRate, { limit: limits.uploadsPerHour }),
      );
    if (bytes.byteLength === 0) throw invalidInput(Errors.MediaEmpty);
    if (bytes.byteLength > this.deps.maxBytes)
      throw invalidInput(
        Errors.MediaTooLarge,
        withParams(Errors.MediaTooLarge, { maxBytes: this.deps.maxBytes }),
      );
    const mime = sniffMediaType(bytes);
    if (!mime) throw invalidInput(Errors.MediaTypeUnsupported);
    if (mime === 'image/svg+xml' && limits.allowSvg !== true)
      throw invalidInput(Errors.MediaTypeUnsupported);

    let allowed = true;
    await this.deps.hooks.applyFilter(
      'media.uploadAllowed',
      {
        allowed,
        filename: displayName(filename),
        mime,
        size: bytes.byteLength,
      },
      (value) => {
        if (!value || typeof value !== 'object') return false;
        const result = value as Record<string, unknown>;
        if (
          typeof result.allowed !== 'boolean' ||
          result.filename !== displayName(filename) ||
          result.mime !== mime ||
          result.size !== bytes.byteLength ||
          (!allowed && result.allowed)
        )
          return false;
        allowed = result.allowed;
        return true;
      },
    );
    if (!allowed) throw forbidden(Errors.MediaUploadRefused);
    const name = await this.deps.hooks.applyFilter(
      'media.filename',
      displayName(filename),
      (value) =>
        typeof value === 'string' &&
        value.length > 0 &&
        value === displayName(value),
    );
    const id = this.deps.ids.next();
    const now = this.deps.clock.now();
    const base = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${id}`;
    const storageKey = `${base}.${MEDIA_TYPES[mime]}`;
    const destination = await this.storage();
    const isImage = mime.startsWith('image/');

    let original = bytes;
    let size: { width: number | null; height: number | null } | null = null;
    const variants: Partial<Record<ImageSizeName, StoredVariant>> = {};
    const files: { key: string; bytes: Uint8Array }[] = [];
    const written: string[] = [];
    try {
      if (mime === 'image/svg+xml') {
        const sanitized = sanitizeSvg(bytes);
        original = sanitized.bytes;
        size = sanitized;
      } else if (isImage) {
        size = await this.deps.images.dimensions(bytes).catch(() => {
          throw invalidInput(Errors.MediaTypeUnsupported);
        });
        if (CLEANED.includes(mime))
          original = await this.processors.process(bytes, mime);
        if (original.byteLength > this.deps.maxBytes)
          original = await this.deps.images.clean(bytes, mime);
        size = await this.deps.images.dimensions(original);
        for (const definition of (this.deps.sizes ?? new ImageSizes()).list()) {
          const { name, width, height, crop } = definition;
          if (
            size.width === null ||
            (size.width <= width &&
              (!height || (size.height !== null && size.height <= height)))
          )
            continue;
          const resized = await this.deps.images.resize(
            original,
            width,
            height,
            crop,
          );
          const key = `${base}-${name}.webp`;
          files.push({ key, bytes: resized.bytes });
          variants[name] = {
            key,
            storageKey: key,
            storageDriver: destination.driver,
            publicUrl: destination.url(key),
            byteSize: resized.bytes.byteLength,
            mime: 'image/webp',
            width: resized.width,
            height: resized.height,
          };
        }
      }
      files.push({ key: storageKey, bytes: original });
      written.push(...files.map(({ key }) => key));
      const freeBytes = limits.freeSpaceMb * 1024 * 1024;
      const stored = await destination.storage.commit(files, freeBytes);
      if (stored === 'low_space') throw conflict(Errors.MediaStorageLow);
      if (stored === 'busy') throw conflict(Errors.MediaStorageBusy);
      const record: MediaWrite = {
        id,
        uploaderId: actor.id,
        filename: name,
        mime,
        size: original.byteLength,
        width: size?.width ?? null,
        height: size?.height ?? null,
        alt: '',
        caption: '',
        storageKey,
        storageDriver: destination.driver,
        publicUrl: destination.url(storageKey),
        byteSize: original.byteLength,
        variants,
        createdAt: now,
      };
      await this.deps.repository.insert(record);
    } catch (error) {
      if (this.deps.cleanup)
        await this.deps.cleanup.rollback(
          id,
          destination.driver,
          written,
          destination.storage,
        );
      else if (written.length && destination.storage.rollback)
        await destination.storage.rollback(written);
      else if (written.length) await destination.storage.remove(written);
      throw error;
    }
    const media = toAdminMedia(await this.require(id));
    void this.deps.hooks.emit('media.uploaded', media);
    return media;
  }

  async update(id: string, input: unknown, actor: Actor): Promise<AdminMedia> {
    const media = await this.editable(id, actor);
    const changes = mediaUpdateSchema.parse(
      await this.deps.hooks.applyFilter(
        'media.beforeSave',
        parseInput(mediaUpdateSchema, input),
        (value) => mediaUpdateSchema.safeParse(value).success,
      ),
    );
    await this.deps.repository.update(media.id, changes);
    const updated = toAdminMedia(await this.require(id));
    void this.deps.hooks.emit('media.updated', updated);
    return updated;
  }

  /** At most two on-demand transforms per service; excess requests never queue image work. */
  async derivative(id: string, name: string, actor: Actor) {
    const media = await this.editable(id, actor);
    const size = (this.deps.sizes ?? new ImageSizes())
      .list()
      .find((size) => size.name === name);
    if (!size) throw notFound(Errors.MediaNotFound);
    if (!CLEANED.includes(media.mime))
      throw invalidInput(Errors.MediaTypeUnsupported);
    if (this.derivatives >= 2) throw rateLimited(Errors.MediaStorageBusy);
    this.derivatives += 1;
    try {
      const file = await (
        await this.storage(media.storageDriver ?? 'local')
      ).storage.read(media.storageKey);
      if (!file) throw notFound(Errors.MediaNotFound);
      const bytes = new Uint8Array(await new Response(file.body).arrayBuffer());
      return await this.deps.images.resize(
        bytes,
        size.width,
        size.height,
        size.crop,
      );
    } finally {
      this.derivatives -= 1;
    }
  }

  /** Save edits as a copy so embedded originals and their immutable URLs remain intact. */
  async edit(id: string, input: unknown, actor: Actor): Promise<AdminMedia> {
    const media = await this.editable(id, actor);
    const changes = parseInput(imageEditSchema, input);
    if (!CLEANED.includes(media.mime))
      throw invalidInput(Errors.MediaTypeUnsupported);
    const file = await (
      await this.storage(media.storageDriver ?? 'local')
    ).storage.read(media.storageKey);
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
      {
        alt: media.alt,
        caption: media.caption,
        title: media.title,
        description: media.description,
      },
      actor,
    );
  }

  /** Deletes the file. Files still shown by entries need `force`. */
  async remove(id: string, force: boolean, actor: Actor): Promise<void> {
    const media = await this.editable(id, actor);
    if (media.usageCount > 0 && !force)
      throw conflict(
        Errors.MediaInUse,
        withParams(Errors.MediaInUse, { count: media.usageCount }),
      );
    // Production persists a cleanup tombstone independently of the job queue.
    if (!this.deps.cleanup)
      await this.deps.cleanupQueue?.enqueue('media.delete', { id });
    await this.cleanup(id);
  }

  /** Idempotent queue handler; unavailable drivers leave the row and job retryable. */
  async cleanup(id: string): Promise<void> {
    const media = await this.deps.repository.get(id);
    if (!media) return;
    const groups = new Map<string, string[]>();
    const add = (driver: string, key: string) => {
      const keys = groups.get(driver) ?? [];
      keys.push(key);
      groups.set(driver, keys);
    };
    add(media.storageDriver ?? 'local', media.storageKey);
    for (const variant of Object.values(media.variants))
      if (variant)
        add(
          variant.storageDriver ?? media.storageDriver ?? 'local',
          variant.storageKey ?? variant.key,
        );
    if (this.deps.cleanup) {
      await this.deps.cleanup.deletion(
        id,
        [...groups].flatMap(([driver, keys]) =>
          keys.map((key) => ({ driver, key })),
        ),
      );
      return;
    }
    for (const [driver, keys] of groups)
      await (await this.storage(driver)).storage.remove(keys);
    await this.finalizeDeletion(id);
  }

  async finalizeDeletion(id: string) {
    const media = await this.deps.repository.get(id);
    if (!media) return;
    await this.deps.repository.delete(id);
    void this.deps.hooks.emit('media.deleted', toAdminMedia(media));
  }

  /** A stored file for serving; keys are opaque and unguessable per upload. */
  async file(key: string, range?: { start: number; end?: number }) {
    const match =
      /^\d{4}\/\d{2}\/([0-9a-f-]{36})(?:-[a-z][a-z0-9-]{0,63})?\.[a-z0-9]+$/.exec(
        key,
      );
    if (!match) return null;
    const media = await this.deps.repository.get(match[1]!);
    if (!media) return null;
    const variant = Object.values(media.variants).find(
      (item) => item?.key === key,
    );
    if (media.storageKey !== key && !variant) return null;
    return (
      await this.storage(
        variant?.storageDriver ?? media.storageDriver ?? 'local',
      )
    ).storage.read(key, range);
  }

  private storage(driver?: string) {
    return (
      this.deps.selectStorage?.(driver) ??
      Promise.resolve({
        driver: 'local',
        storage: this.deps.storage,
        url: (key: string) => `/media/${key}`,
      })
    );
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
