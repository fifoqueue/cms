import { MEDIA_PATH, mediaKindOf } from '@cms/sdk';
import type { AdminMedia, ImageSizeName, PublicImage } from '@cms/sdk';
import type { MediaRecord, StoredVariant } from '#api/domain/media/ports';

/** Site-relative address of a stored file. */
export const mediaUrl = (key: string) => `${MEDIA_PATH}${key}`;

export const toAdminMedia = (media: MediaRecord): AdminMedia => ({
  id: media.id,
  missingAt: media.missingAt?.toISOString() ?? null,
  filename: media.filename,
  mime: media.mime,
  kind: mediaKindOf(media.mime),
  size: media.size,
  width: media.width,
  height: media.height,
  alt: media.alt,
  caption: media.caption,
  title: media.title ?? '',
  description: media.description ?? '',
  url: media.publicUrl ?? mediaUrl(media.storageKey),
  variants: Object.keys(media.variants).flatMap((name) => {
    const variant = media.variants[name];
    return variant
      ? [
          {
            name,
            url: variant.publicUrl ?? mediaUrl(variant.key),
            width: variant.width,
            height: variant.height,
          },
        ]
      : [];
  }),
  uploaderId: media.uploaderId,
  uploaderName: media.uploaderName,
  createdAt: media.createdAt.toISOString(),
  usageCount: media.usageCount,
});

/** The public projection of an image: original plus responsive sizes, narrowest first. */
export const toPublicImage = (image: {
  storageKey: string;
  publicUrl?: string | null;
  alt: string;
  width: number | null;
  height: number | null;
  variants: Partial<Record<ImageSizeName, StoredVariant>>;
}): PublicImage => ({
  url: image.publicUrl ?? mediaUrl(image.storageKey),
  alt: image.alt,
  width: image.width,
  height: image.height,
  sizes: [
    ...Object.keys(image.variants).flatMap((name) => {
      const variant = image.variants[name];
      return variant
        ? [
            {
              url: variant.publicUrl ?? mediaUrl(variant.key),
              width: variant.width,
            },
          ]
        : [];
    }),
    ...(image.width
      ? [
          {
            url: image.publicUrl ?? mediaUrl(image.storageKey),
            width: image.width,
          },
        ]
      : []),
  ],
});

/** Parses the stored `variants` JSON; damaged values count as none. */
export const parseVariants = (
  raw: string,
): Partial<Record<ImageSizeName, StoredVariant>> => {
  try {
    const value = JSON.parse(raw) as Record<string, StoredVariant>;
    return Object.fromEntries(
      Object.keys(value)
        .filter((name) => typeof value[name]?.key === 'string')
        .map((name) => [name, value[name]!]),
    );
  } catch {
    return {};
  }
};
