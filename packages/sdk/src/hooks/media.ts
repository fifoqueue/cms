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

export interface MediaFilterHooks {
  'media.beforeSave': MediaUpdateInput;
  /** Display name only; never a storage path. */
  'media.filename': string;
  /** Core admission checks have already passed. A refusal is irreversible. */
  'media.uploadAllowed': {
    allowed: boolean;
    filename: string;
    mime: string;
    size: number;
  };
}
