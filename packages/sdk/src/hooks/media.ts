import type { AdminMedia, MediaUpdateInput } from '#sdk/media';
import type { MediaType } from '#sdk/media';
import type { Awaitable } from '#sdk/common';

export interface MediaProcessor {
  /** Return optimized bytes in the same format. Core decoding/cleaning still follows. */
  process(input: { bytes: Uint8Array; mime: MediaType }): Awaitable<Uint8Array>;
}
export interface MediaProcessorRegistrar {
  register(processor: MediaProcessor): () => void;
}
export interface ImageSize {
  name: string;
  width: number;
  height?: number;
  crop?: boolean;
}
export interface ImageSizeRegistrar {
  register(size: ImageSize): () => void;
}

export interface MediaActionHooks {
  /** Metadata has been committed. */
  'media.updated': AdminMedia;
}

/** Trusted handlers borrow the original bytes; plugins receive isolated copies. */
export interface MediaUploadContext {
  readonly bytes: Readonly<Uint8Array>;
  readonly mime: MediaType;
  readonly size: number;
  readonly originalName: string;
}

export interface MediaFilterArgs {
  'media.storageKey': [
    context: Readonly<{
      id: string;
      mime: MediaType;
      bytes: Readonly<Uint8Array>;
      size: number;
      uploadedAt: string;
      filename: string;
    }>,
  ];
  'media.filename': [context: Readonly<MediaUploadContext>];
  'media.uploadAllowed': [context: Readonly<MediaUploadContext>];
  'media.deleteAllowed': [context: Readonly<{ media: AdminMedia }>];
}

export interface MediaFilterHooks {
  'media.url': {
    url: string;
    key: string;
    variant: string | null;
    driver: string;
  };
  'media.storageKey': {
    key: string;
    directory: string;
    basename: string;
    extension: string;
  };
  'media.allowedTypes': MediaType[];
  'media.deleteAllowed': boolean;
  'media.beforeInsert': {
    filename: string;
    alt: string;
    caption: string;
    title?: string;
    description?: string;
  };
  'media.imageSizes': {
    mime: MediaType;
    width: number;
    height: number;
    sizes: ImageSize[];
    quality?: number;
  };
  'media.beforeSave': MediaUpdateInput;
  /** Display name only; never a storage path. */
  'media.filename': string;
  /** Core supplies the initial decision; handlers may allow or refuse. Shape and identity stay validated. */
  'media.uploadAllowed': {
    allowed: boolean;
    filename: string;
    mime: string;
    size: number;
  };
}
