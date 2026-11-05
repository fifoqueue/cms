import type { PublicImage } from '@cms/sdk';

/** Explicit block copy overrides library copy; unknown URLs remain usable without invented sizes. */
export const themeImage = (
  images: Record<string, PublicImage> | undefined,
  url: string,
  alt: string,
  decorative = false,
): PublicImage => {
  const image = images?.[url];

  return {
    url: image?.url ?? url,
    alt: decorative ? '' : alt || image?.alt || '',
    width: image?.width ?? null,
    height: image?.height ?? null,
    sizes: image?.sizes ?? [],
  };
};
