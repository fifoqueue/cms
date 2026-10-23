import type {
  ImageEdit,
  ImageSizeName,
  MediaKind,
  MediaType,
  PublicImage,
} from '@cms/sdk';

export interface StoredVariant {
  key: string;
  width: number;
  height: number;
}

export interface MediaRecord {
  id: string;
  uploaderId: string | null;
  uploaderName: string;
  filename: string;
  mime: MediaType;
  size: number;
  width: number | null;
  height: number | null;
  alt: string;
  caption: string;
  storageKey: string;
  variants: Partial<Record<ImageSizeName, StoredVariant>>;
  createdAt: Date;
  /** Entries that show the file. */
  usageCount: number;
}

export type MediaWrite = Omit<MediaRecord, 'uploaderName' | 'usageCount'>;

export interface MediaCriteria {
  kind?: MediaKind;
  /** Substring of the file name, alt text or caption. */
  search?: string;
  page: number;
  pageSize: number;
}

export interface MediaRepository {
  insert(media: MediaWrite): Promise<void>;
  get(id: string): Promise<MediaRecord | null>;
  /** Whether the media row still exists; deleted rows must never serve orphaned files. */
  exists(id: string): Promise<boolean>;
  /** Newest first. */
  list(
    criteria: MediaCriteria,
  ): Promise<{ items: MediaRecord[]; total: number }>;
  update(
    id: string,
    changes: { alt?: string; caption?: string },
  ): Promise<void>;
  /** Public projections of the given images that exist. */
  publicImages(ids: readonly string[]): Promise<Map<string, PublicImage>>;
  /** Also removes its usage links and featured-image references. */
  delete(id: string): Promise<void>;
}

/** Bytes of uploaded files by key. Shared by every API instance. */
export interface MediaStorage {
  /** Bytes available on the backing volume before a write starts. */
  available(): Promise<number>;
  write(key: string, bytes: Uint8Array): Promise<void>;
  /** The file, or the byte range `[start, end]`; null when missing. */
  read(
    key: string,
    range?: { start: number; end?: number },
  ): Promise<{
    body: ReadableStream<Uint8Array>;
    size: number;
    start: number;
    end: number;
  } | null>;
  remove(keys: readonly string[]): Promise<void>;
}

/** Image decoding and re-encoding. Throws on undecodable input. */
export interface ImageProcessor {
  /** A WebP copy; the source remains unchanged. */
  edit(bytes: Uint8Array, changes: ImageEdit): Promise<Uint8Array>;
  /** Pixel size of a decodable image. */
  dimensions(bytes: Uint8Array): Promise<{ width: number; height: number }>;
  /** Re-encodes in the same format, upright, without metadata (location, camera). */
  clean(bytes: Uint8Array, mime: MediaType): Promise<Uint8Array>;
  /** A WebP copy at most `width` pixels wide. */
  resize(
    bytes: Uint8Array,
    width: number,
  ): Promise<{ bytes: Uint8Array; width: number; height: number }>;
}
