import type { PublicImage } from '@cms/sdk';
import type {
  ImageProcessor,
  MediaCriteria,
  MediaRecord,
  MediaRepository,
  MediaStorage,
  MediaWrite,
} from '#api/domain/media/ports';

/** Same contract as `PrismaMediaRepository`; `usages` stands in for `content_media`. */
export class MemoryMediaRepository implements MediaRepository {
  readonly rows = new Map<string, MediaWrite>();
  readonly usages = new Map<string, number>();

  async insert(media: MediaWrite) {
    this.rows.set(media.id, structuredClone(media));
  }

  async get(id: string) {
    const row = this.rows.get(id);
    return row ? this.toRecord(row) : null;
  }

  async exists(id: string) {
    return this.rows.has(id);
  }

  async list({ kind, search, page, pageSize }: MediaCriteria) {
    const prefix = {
      image: 'image/',
      audio: 'audio/',
      video: 'video/',
      document: 'application/',
    };
    const items = [...this.rows.values()]
      .filter((row) => !kind || row.mime.startsWith(prefix[kind]))
      .filter((row) => !search || row.filename.includes(search))
      .reverse();
    return {
      items: items
        .slice((page - 1) * pageSize, page * pageSize)
        .map((row) => this.toRecord(row)),
      total: items.length,
    };
  }

  async publicImages(ids: readonly string[]) {
    const images = new Map<string, PublicImage>();
    for (const id of ids) {
      const row = this.rows.get(id);
      if (row)
        images.set(id, {
          url: `/media/${row.storageKey}`,
          alt: row.alt,
          width: row.width,
          height: row.height,
          sizes: [],
        });
    }
    return images;
  }

  async update(id: string, changes: { alt?: string; caption?: string }) {
    const row = this.rows.get(id)!;
    if (changes.alt !== undefined) row.alt = changes.alt;
    if (changes.caption !== undefined) row.caption = changes.caption;
  }

  async delete(id: string) {
    this.rows.delete(id);
    this.usages.delete(id);
  }

  private toRecord(row: MediaWrite): MediaRecord {
    return {
      ...structuredClone(row),
      uploaderName: row.uploaderId ?? '',
      usageCount: this.usages.get(row.id) ?? 0,
    };
  }
}

export class MemoryMediaStorage implements MediaStorage {
  readonly files = new Map<string, Uint8Array>();
  freeBytes = Number.POSITIVE_INFINITY;

  async available() {
    return this.freeBytes;
  }

  async write(key: string, bytes: Uint8Array) {
    this.files.set(key, bytes);
  }

  async read(key: string, range?: { start: number; end?: number }) {
    const bytes = this.files.get(key);
    if (!bytes) return null;
    const start = range?.start ?? 0;
    const end = Math.min(range?.end ?? bytes.length - 1, bytes.length - 1);
    return {
      body: new Blob([bytes.slice(start, end + 1)]).stream(),
      size: bytes.length,
      start,
      end,
    };
  }

  async remove(keys: readonly string[]) {
    for (const key of keys) this.files.delete(key);
  }
}

/** Pretends every image is 2000×1000 and marks re-encoded bytes. */
export const fakeImages: ImageProcessor = {
  edit: async (bytes) => bytes,
  dimensions: async () => ({ width: 2000, height: 1000 }),
  clean: async (bytes) => new Uint8Array([...bytes, 0]),
  resize: async (_bytes, width) => ({
    bytes: new Uint8Array([width % 256]),
    width,
    height: width / 2,
  }),
};
