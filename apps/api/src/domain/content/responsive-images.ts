import type { PublicImage } from '@cms/sdk';

/** Public projections of library images by id; missing ones are left out. */
export type ImageLookup = (
  ids: readonly string[],
) => Promise<Map<string, PublicImage>>;

const IMAGE = /<img\b([^>]*?)\s*\/?>/g;
const MEDIA_ID = /\sdata-media-id="([^"]+)"/;
/** Body images rarely exceed the theme's content width (40–46rem in the built-in themes). */
const SIZES = '(max-width: 48rem) 100vw, 48rem';

const escapeAttribute = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/**
 * Makes body images responsive when content is served: `srcset` from the library's WebP sizes,
 * intrinsic dimensions against layout shift, and lazy loading below the first image (often the
 * largest paint). Images that already declare `srcset` or `loading` are left as they are.
 */
export class ResponsiveImages {
  constructor(private readonly images: ImageLookup) {}

  async expand(html: string): Promise<string> {
    if (!html.includes('<img')) return html;
    const ids = [
      ...new Set(
        [...html.matchAll(new RegExp(MEDIA_ID, 'g'))].map(([, id]) => id!),
      ),
    ];
    const images = ids.length
      ? await this.images(ids)
      : new Map<string, PublicImage>();
    let index = 0;
    return html.replace(IMAGE, (tag, attrs: string) => {
      if (/\s(?:srcset|loading)=/.test(attrs)) return tag;
      const image = images.get(MEDIA_ID.exec(attrs)?.[1] ?? '');
      const extra: string[] = [];
      if (image && image.sizes.length > 1)
        extra.push(
          `srcset="${image.sizes.map(({ url, width }) => `${escapeAttribute(url)} ${width}w`).join(', ')}"`,
          `sizes="${SIZES}"`,
        );
      if (image?.width && image.height && !/\s(?:width|height)=/.test(attrs))
        extra.push(`width="${image.width}" height="${image.height}"`);
      if (index++ > 0) extra.push('loading="lazy"');
      extra.push('decoding="async"');
      return `<img${attrs} ${extra.join(' ')}>`;
    });
  }
}
