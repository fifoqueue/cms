import { IMAGE_SIZES } from '@cms/sdk';
import type { ImageSize, ImageSizeRegistrar } from '@cms/sdk/plugin';
import { z } from 'zod';
import type { Logger } from '#api/shared/logger';

const schema = z.object({
  name: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/),
  width: z.number().int().min(1).max(8192),
  height: z.number().int().min(1).max(8192).optional(),
  crop: z.boolean().default(false),
});

/**
 * Declarations only: core performs decoding and cropping, never plugin code.
 * Core sizes win: plugin registrations for a core name are refused.
 */
export class ImageSizes implements ImageSizeRegistrar {
  private readonly entries = new Map<object, ImageSize>();
  private readonly core = new Set<string>(Object.keys(IMAGE_SIZES));
  constructor(private readonly logger?: Pick<Logger, 'warn'>) {
    for (const [name, width] of Object.entries(IMAGE_SIZES))
      this.add(schema.parse({ name, width }));
  }
  register(input: ImageSize) {
    const size = schema.parse(input);
    if (this.core.has(size.name)) {
      this.logger?.warn(
        `Image size "${size.name}" is reserved by core; registration ignored`,
      );
      return () => undefined;
    }
    return this.add(size);
  }
  private add(size: ImageSize) {
    const token = {};
    this.entries.set(token, size);
    return () => {
      this.entries.delete(token);
    };
  }
  list() {
    const sizes = new Map<string, ImageSize>();
    for (const size of this.entries.values()) {
      if (!sizes.has(size.name) && sizes.size >= 32) {
        this.logger?.warn(
          `Image size "${size.name}" dropped: active size limit is 32`,
        );
        continue;
      }
      sizes.set(size.name, { ...size });
    }
    return [...sizes.values()];
  }
}
