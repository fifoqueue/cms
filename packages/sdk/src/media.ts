import { z } from 'zod';
import { PAGINATION_MAX_PAGE } from '#sdk/common';
import { mailFieldSchema, pluginMailIdSchema } from '#sdk/email';

export { MEDIA_PATH } from '#sdk/media-paths';

/** Accepted uploads by MIME type; SVG additionally requires the upload policy. */
export const MEDIA_TYPES = {
  'image/svg+xml': 'svg',
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
  // Web fonts for the site fonts (stored as they are; never processed).
  'font/woff2': 'woff2',
  'font/woff': 'woff',
  'font/ttf': 'ttf',
  'font/otf': 'otf',
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
export type ImageSizeName = string;

export const mediaVariantSchema = z.object({
  name: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/),
  url: z.string(),
  width: z.number().int(),
  height: z.number().int(),
});

export type MediaVariant = z.output<typeof mediaVariantSchema>;

/** An uploaded file as the media library shows it. */
export const adminMediaSchema = z.object({
  id: z.string(),
  missingAt: z.string().nullable().default(null),
  filename: z.string(),
  mime: z.string(),
  kind: z.enum(MEDIA_KINDS),
  size: z.number().int().nonnegative(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  alt: z.string(),
  caption: z.string(),
  title: z.string().default(''),
  description: z.string().default(''),
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
  title: z.string().trim().max(255).optional(),
  description: z.string().trim().max(10000).optional(),
});

export type MediaUpdateInput = z.input<typeof mediaUpdateSchema>;

export const mediaListQuerySchema = z.object({
  missing: z.stringbool().optional(),
  kind: z.enum(MEDIA_KINDS).optional(),
  search: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((value) => value || undefined),
  /** `YYYY-MM`: uploaded in that month (UTC). */
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .optional(),
  /** Only files that no entry or stored pattern shows. */
  unattached: z.stringbool().optional(),
  page: z.coerce.number().int().min(1).max(PAGINATION_MAX_PAGE).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
});

export type MediaListQuery = z.input<typeof mediaListQuerySchema>;

/** Where a file sits in the library (newest first) and which entries show it. */
export const mediaContextSchema = z.object({
  newerId: z.string().nullable(),
  olderId: z.string().nullable(),
  usedIn: z.array(
    z.object({ id: z.string(), title: z.string(), type: z.string() }),
  ),
});

export type MediaContext = z.output<typeof mediaContextSchema>;

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

// Zod runs this refinement even when `z.url()` already failed, so unparsable input is refused here.
const storageUrl = z.url().refine((value) => {
  const url = URL.parse(value);
  return (
    url !== null &&
    ['https:', 'http:'].includes(url.protocol) &&
    !url.username &&
    !url.password &&
    !url.search &&
    !url.hash
  );
});
const s3SettingsSchema = z.object({
  endpoint: storageUrl,
  region: z.string().trim().min(1).max(100),
  bucket: z.string().trim().min(1).max(255),
  accessKeyId: z.string().trim().min(1).max(255),
  publicBaseUrl: storageUrl.optional(),
  forcePathStyle: z.boolean().default(false),
  prefix: z
    .string()
    .max(200)
    .regex(/^(?:[a-zA-Z0-9_-]+\/)*$/)
    .default(''),
});
const storageDriverId = z.union([
  z.enum(['local', 's3']),
  pluginMailIdSchema.max(128),
]);
const storageValues = z.record(
  z.string(),
  z.union([z.string().max(10000), z.number().finite(), z.boolean()]),
);
export const mediaStorageSettingsSchema = z.object({
  driver: storageDriverId,
  availableDrivers: z
    .array(
      z.object({
        id: z.string(),
        label: z.string(),
        fields: z.array(mailFieldSchema),
      }),
    )
    .optional(),
  pluginSettings: storageValues.optional(),
  pluginSecretsConfigured: z.array(z.string()).optional(),
  s3: s3SettingsSchema
    .extend({
      secretAccessKeyConfigured: z.boolean(),
    })
    .nullable(),
});
export const mediaStorageInputSchema = z
  .object({
    driver: storageDriverId,
    pluginSettings: storageValues.optional(),
    s3: s3SettingsSchema
      .extend({
        /** Omit to keep the saved secret; provide a nonempty value to replace it. */
        secretAccessKey: z.string().min(1).max(4096).optional(),
      })
      .nullable(),
  })
  .refine((value) => value.driver !== 's3' || value.s3 !== null);
export type MediaStorageSettings = z.output<typeof mediaStorageSettingsSchema>;
export type MediaStorageInput = z.input<typeof mediaStorageInputSchema>;
export const mediaResyncSchema = z.object({
  cleanupNeedsAttention: z.number().int().nonnegative().default(0),
  id: z.string(),
  status: z.enum(['queued', 'running', 'completed', 'failed']),
  driver: storageDriverId,
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
  scanned: z.number().int().nonnegative(),
  refreshed: z.number().int().nonnegative(),
  missing: z.number().int().nonnegative(),
  untracked: z.number().int().nonnegative(),
  error: z.string().nullable(),
});
export type MediaResync = z.output<typeof mediaResyncSchema>;
