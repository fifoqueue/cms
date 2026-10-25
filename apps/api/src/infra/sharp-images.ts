import { default as sharp } from 'sharp';
import type { MediaType } from '@cms/sdk';
import type { ImageProcessor } from '#api/domain/media/ports';
import { Errors } from '#api/shared/errors';

/** Bounds one decode to about 160 MB of raw RGBA pixels. */
const LIMIT = { limitInputPixels: 40_000_000 };

let imageQueue: Promise<unknown> = Promise.resolve();

/** libvips work is memory-heavy; run one transform at a time per API process. */
const runImage = <T>(task: () => Promise<T>): Promise<T> => {
  const run = imageQueue.then(task, task);
  imageQueue = run.catch(() => undefined);
  return run;
};

const FORMATS: Partial<Record<MediaType, 'jpeg' | 'png' | 'webp' | 'avif'>> = {
  'image/jpeg': 'jpeg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
};

/** Image work through sharp (libvips). Metadata is dropped unless kept explicitly. */
export const sharpImages: ImageProcessor = {
  async edit(bytes, changes) {
    return new Uint8Array(
      await runImage(async () => {
        let image = sharp(bytes, LIMIT).autoOrient();
        if (changes.crop) image = image.extract(changes.crop);
        image = image
          .rotate(changes.rotate)
          .flip(changes.flip)
          .flop(changes.flop);
        return image.webp({ quality: 90 }).toBuffer();
      }),
    );
  },
  async dimensions(bytes) {
    const { width, height, autoOrient } = await runImage(() =>
      sharp(bytes, LIMIT).metadata(),
    );
    if (!width || !height) throw new Error(Errors.MediaTypeUnsupported);
    return { width: autoOrient.width, height: autoOrient.height };
  },
  async clean(bytes, mime) {
    const format = FORMATS[mime];
    if (!format) return bytes;
    const output = await runImage(() =>
      sharp(bytes, LIMIT).rotate().toFormat(format).toBuffer(),
    );
    return new Uint8Array(output);
  },
  async resize(bytes, width, height, crop = false) {
    const { data, info } = await runImage(() =>
      sharp(bytes, LIMIT)
        .rotate()
        .resize({
          width,
          height,
          fit: crop ? 'cover' : 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality: 82 })
        .toBuffer({ resolveWithObject: true }),
    );
    return {
      bytes: new Uint8Array(data),
      width: info.width,
      height: info.height,
    };
  },
};
