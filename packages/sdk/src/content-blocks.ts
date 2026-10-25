import { z } from 'zod';
import { calloutAttributesSchema } from '#sdk/callout';
import { codeBlockAttributesSchema } from '#sdk/code-block';
import { tocAttrsSchema } from '#sdk/toc';

export const CONTENT_ALIGNMENTS = [
  'left',
  'center',
  'right',
  'wide',
  'full',
] as const;
export const TEXT_ALIGNMENTS = ['left', 'center', 'right', 'justify'] as const;

const text = z.string().max(2000);
const url = z.string().max(2048).nullable();
const mediaId = z.string().min(1).max(36).nullable();
const align = z.enum(CONTENT_ALIGNMENTS);
const textAlign = z.enum(TEXT_ALIGNMENTS).nullable();
/**
 * Attributes that existed before the block library. Tiptap parses HTML attribute text into
 * strings, numbers or booleans, and stored documents keep whatever it produced (`c#`,
 * `target="report"`, `width="100%"`), so these accept any scalar; the renderer escapes them.
 */
const legacy = z
  .union([z.string().max(65535), z.number(), z.boolean()])
  .nullable();
const media = { src: url, mediaId };
const cell = {
  colspan: legacy,
  rowspan: legacy,
  colwidth: z.array(legacy).max(1000).nullable(),
  align: legacy,
};

/** Attribute allowlists for the shared editor schema. URL schemes are sanitized by its renderer. */
export const contentAttributeSchemas = {
  footnote: z.strictObject({
    text: z
      .string()
      .min(1)
      .max(2000)
      .refine((value) => value.trim().length > 0),
  }),
  tableOfContents: tocAttrsSchema,
  image: z
    .strictObject({
      src: legacy,
      mediaId: legacy,
      alt: legacy,
      title: legacy,
      width: legacy,
      height: legacy,
      caption: text,
      align,
      href: url,
      newTab: z.boolean(),
    })
    .partial(),
  audio: z.strictObject({ src: legacy, mediaId: legacy }).partial(),
  video: z
    .strictObject({
      ...media,
      caption: text,
      poster: url,
      posterId: mediaId,
      loop: z.boolean(),
      muted: z.boolean(),
    })
    .partial(),
  file: z
    .strictObject({ ...media, name: text, download: z.boolean() })
    .partial(),
  gallery: z
    .strictObject({
      columns: z.number().int().min(1).max(6),
      crop: z.boolean(),
      caption: text,
      align,
    })
    .partial(),
  columns: z.strictObject({ stack: z.boolean() }).partial(),
  buttons: z
    .strictObject({ align: z.enum(['left', 'center', 'right']) })
    .partial(),
  button: z
    .strictObject({
      href: url,
      variant: z.enum(['fill', 'outline']),
      newTab: z.boolean(),
    })
    .partial(),
  details: z.strictObject({ open: z.boolean() }).partial(),
  pullquote: z.strictObject({ cite: text }).partial(),
  callout: calloutAttributesSchema,
  spacer: z
    .strictObject({ height: z.number().int().min(0).max(500) })
    .partial(),
  table: z.strictObject({ caption: text }).partial(),
  tableCell: z.strictObject(cell).partial(),
  tableHeader: z.strictObject(cell).partial(),
  paragraph: z.strictObject({ textAlign }).partial(),
  heading: z
    .strictObject({
      level: legacy,
      textAlign,
      /** A fixed fragment id (e.g. an imported Gutenberg "HTML anchor"); generated otherwise. */
      anchor: z
        .string()
        .regex(/^[\p{L}][\p{L}\p{N}\p{M}_:.-]{0,99}$/u)
        .nullable(),
    })
    .partial(),
  embed: z.strictObject({ url: legacy }).partial(),
  /** A plugin's dynamic block (`plugin:<id>:<key>`), rendered by the plugin when served. */
  pluginBlock: z
    .strictObject({
      block: z.string().regex(/^plugin:[a-z0-9-]{1,64}:[a-z0-9-]{1,64}$/),
      attrs: z
        .record(
          z.string().max(64),
          z.union([z.string().max(5000), z.number(), z.boolean()]),
        )
        .refine((attrs) => Object.keys(attrs).length <= 30),
    })
    .partial(),
  /** A synced pattern by id; the API puts the pattern's published body in its place. */
  patternRef: z
    .strictObject({
      ref: z
        .string()
        .regex(/^[A-Za-z0-9-]{1,36}$/)
        .nullable(),
    })
    .partial(),
  codeBlock: codeBlockAttributesSchema,
  orderedList: z.strictObject({ start: legacy, type: legacy }).partial(),
  link: z
    .strictObject({
      href: legacy,
      target: legacy,
      rel: legacy,
      class: legacy,
      title: legacy,
    })
    .partial(),
};
