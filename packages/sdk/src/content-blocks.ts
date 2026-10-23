import { z } from 'zod';

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
const dimension = z.number().int().min(1).max(20000).nullable();
const align = z.enum(CONTENT_ALIGNMENTS);
const textAlign = z.enum(TEXT_ALIGNMENTS).nullable();
const media = { src: url, mediaId };
const cell = {
  colspan: z.number().int().min(1).max(100),
  rowspan: z.number().int().min(1).max(100),
  colwidth: z.array(z.number().int().min(1).max(4000)).max(100).nullable(),
  align: z.enum(['left', 'center', 'right']).nullable(),
};

/** Attribute allowlists for the shared editor schema. URL schemes are sanitized by its renderer. */
export const contentAttributeSchemas = {
  image: z
    .strictObject({
      ...media,
      alt: text.nullable(),
      title: text.nullable(),
      width: dimension,
      height: dimension,
      caption: text,
      align,
      href: url,
      newTab: z.boolean(),
    })
    .partial(),
  audio: z.strictObject(media).partial(),
  video: z
    .strictObject({
      ...media,
      caption: text,
      poster: url,
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
  spacer: z
    .strictObject({ height: z.number().int().min(0).max(500) })
    .partial(),
  table: z.strictObject({ caption: text }).partial(),
  tableCell: z.strictObject(cell).partial(),
  tableHeader: z.strictObject(cell).partial(),
  paragraph: z.strictObject({ textAlign }).partial(),
  heading: z
    .strictObject({ level: z.number().int().min(2).max(4), textAlign })
    .partial(),
  embed: z.strictObject({ url }).partial(),
  codeBlock: z
    .strictObject({
      language: z
        .string()
        .max(64)
        .regex(/^[\w+-]*$/)
        .nullable(),
    })
    .partial(),
  orderedList: z
    .strictObject({
      start: z.number().int().min(1).max(1000000),
      type: z.enum(['1', 'a', 'A', 'i', 'I']).nullable(),
    })
    .partial(),
  link: z
    .strictObject({
      href: url,
      target: z.enum(['_self', '_blank']).nullable(),
      rel: z
        .string()
        .max(100)
        .regex(/^[a-z -]*$/)
        .nullable(),
      class: z.string().max(200).nullable(),
      title: text.nullable(),
    })
    .partial(),
};
