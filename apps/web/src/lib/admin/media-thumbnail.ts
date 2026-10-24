/** The file's thumbnail variant, or the original when it has none. */
export const thumbnailUrl = (media: {
  url: string;
  variants: readonly { name: string; url: string }[];
}) =>
  media.variants.find((variant) => variant.name === 'thumbnail')?.url ??
  media.url;
