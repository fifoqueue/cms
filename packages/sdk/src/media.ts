import { z } from 'zod';
import { PAGINATION_MAX_PAGE } from '#sdk/common';

export { MEDIA_PATH } from '#sdk/media-paths';

/** Accepted uploads by MIME type. SVG is refused: it can carry scripts. */
export const MEDIA_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'application/pdf': 'pdf',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/ogg': 'ogg',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
} as const;

export type MediaType = keyof typeof MEDIA_TYPES;

export const MEDIA_KINDS = ['image', 'document', 'video', 'audio'] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

export const mediaKindOf = (mime: string): MediaKind =>
  mime.startsWith('image/')
    ? 'image'
    : mime.startsWith('video/')
      ? 'video'
      : mime.startsWith('audio/')
        ? 'audio'
        : 'document';

/** Resized copies of images, by name, at most this many pixels wide. */
export const IMAGE_SIZES = {
  thumbnail: 300,
  medium: 768,
  large: 1536,
} as const;
export type ImageSizeName = keyof typeof IMAGE_SIZES;

export const mediaVariantSchema = z.object({
  name: z.enum(['thumbnail', 'medium', 'large']),
  url: z.string(),
  width: z.number().int(),
  height: z.number().int(),
});

export type MediaVariant = z.output<typeof mediaVariantSchema>;

/** An uploaded file as the media library shows it. */
export const adminMediaSchema = z.object({
  id: z.string(),
  filename: z.string(),
  mime: z.string(),
  kind: z.enum(MEDIA_KINDS),
  size: z.number().int().nonnegative(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  alt: z.string(),
  caption: z.string(),
  /** Site-relative address of the original file (`/media/...`). */
  url: z.string(),
  variants: z.array(mediaVariantSchema),
  uploaderId: z.string().nullable(),
  uploaderName: z.string(),
  createdAt: z.string(),
  /** Entries that show this file in their body or as their featured image. */
  usageCount: z.number().int().nonnegative(),
});

export type AdminMedia = z.output<typeof adminMediaSchema>;

/** Omitted fields keep their stored text (a picker may change the alt text only). */
export const mediaUpdateSchema = z.object({
  alt: z.string().trim().max(500).optional(),
  caption: z.string().trim().max(2000).optional(),
});

export type MediaUpdateInput = z.input<typeof mediaUpdateSchema>;

export const mediaListQuerySchema = z.object({
  kind: z.enum(MEDIA_KINDS).optional(),
  search: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((value) => value || undefined),
  page: z.coerce.number().int().min(1).max(PAGINATION_MAX_PAGE).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
});

export type MediaListQuery = z.input<typeof mediaListQuerySchema>;

/** A public image with its responsive sizes (`srcset` candidates, narrowest first). */
export const publicImageSchema = z.strictObject({
  url: z.string(),
  alt: z.string(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  sizes: z.array(z.strictObject({ url: z.string(), width: z.number().int() })),
});

export type PublicImage = z.output<typeof publicImageSchema>;

export { MEDIA_FILENAME_HEADER } from '#sdk/media-headers';

/** Pixel crop applies before rotation and flips. Editing produces a new media item. */
export const imageEditSchema = z.object({
  crop: z
    .object({
      left: z.number().int().min(0),
      top: z.number().int().min(0),
      width: z.number().int().min(1),
      height: z.number().int().min(1),
    })
    .optional(),
  rotate: z
    .union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)])
    .default(0),
  flip: z.boolean().default(false),
  flop: z.boolean().default(false),
});
export type ImageEditInput = z.input<typeof imageEditSchema>;
export type ImageEdit = z.output<typeof imageEditSchema>;
