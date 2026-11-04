import { z } from 'zod';
import { KEBAB_CASE } from '#sdk/common';
import { Errors } from '#sdk/errors';
import { taxonomyTypeSchema } from '#sdk/taxonomy-keys';

export { fieldValuesSchema } from '#sdk/field-values';
export type { FieldValues } from '#sdk/field-values';

/** Types every site has. They cannot be removed, and their keys are reserved. */
export const BUILTIN_CONTENT_TYPES = ['post', 'article', 'page'] as const;

/** Stored administrator keys retain their original validation. */
const customTypeKeySchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .max(32)
  .regex(KEBAB_CASE);

/** Plugin keys are namespaced; existing built-in and custom keys stay valid. */
export const contentTypeKeySchema = z.union([
  customTypeKeySchema,
  z
    .string()
    .max(136)
    .regex(/^plugin:[a-z0-9]+(?:-[a-z0-9]+)*:[a-z0-9]+(?:-[a-z0-9]+)*$/),
]);

/** What the editor offers for entries of a type. */
export const contentTypeSupportsSchema = z.object({
  categories: z.boolean().default(true),
  tags: z.boolean().default(true),
  comments: z.boolean().default(true),
  featuredImage: z.boolean().default(true),
});

export type ContentTypeSupports = z.output<typeof contentTypeSupportsSchema>;

/**
 * A content type. `archive` publishes a list of its entries at `/archive/<key>`; `searchable`
 * includes them in site search and feeds.
 */
export const contentTypeSchema = z.object({
  key: contentTypeKeySchema,
  name: z.string().trim().min(1).max(64),
  pluralName: z.string().trim().min(1).max(64),
  description: z.string().trim().max(500).default(''),
  archive: z.boolean().default(false),
  searchable: z.boolean().default(true),
  supports: contentTypeSupportsSchema.default({
    categories: true,
    tags: true,
    comments: true,
    featuredImage: true,
  }),
  builtin: z.boolean().default(false),
});

export type ContentTypeDefinition = z.output<typeof contentTypeSchema>;

/** Creating or changing a custom type; `builtin` is never accepted from clients. */
export const contentTypeInputSchema = contentTypeSchema
  .omit({ builtin: true })
  .extend({ key: customTypeKeySchema });

export type ContentTypeInput = z.input<typeof contentTypeInputSchema>;

export const FIELD_TYPES = [
  'text',
  'textarea',
  'number',
  'boolean',
  'date',
  'url',
  'select',
  'image',
] as const;

export type FieldType = (typeof FIELD_TYPES)[number];

/**
 * A custom field shown in the editor for the listed content types, on the terms of the listed
 * taxonomies and, with `comments`, in the public comment form. At least one target is required.
 */
export const fieldDefinitionSchema = z
  .object({
    key: z.union([
      z
        .string()
        .trim()
        .min(1)
        .max(64)
        .regex(/^[a-z][a-z0-9_]*$/),
      z
        .string()
        .max(136)
        .regex(/^plugin:[a-z0-9]+(?:-[a-z0-9]+)*:[a-z0-9]+(?:-[a-z0-9]+)*$/),
    ]),
    label: z.string().trim().min(1).max(100),
    type: z.enum(FIELD_TYPES),
    /** Choices of a `select` field. */
    options: z.array(z.string().trim().min(1).max(100)).max(100).default([]),
    required: z.boolean().default(false),
    /** Served in the public API; otherwise kept for the administration only. */
    public: z.boolean().default(true),
    help: z.string().trim().max(300).default(''),
    contentTypes: z.array(contentTypeKeySchema).max(50).default([]),
    taxonomies: z.array(taxonomyTypeSchema).max(50).default([]),
    /** Asked in the public comment form and stored with each comment (visitors cannot pick media). */
    comments: z.boolean().default(false),
  })
  .refine((field) => field.type !== 'select' || field.options.length > 0, {
    message: Errors.FieldOptionsRequired,
    path: ['options'],
  })
  .refine((field) => !field.comments || field.type !== 'image', {
    message: Errors.FieldCommentImage,
    path: ['type'],
  })
  .refine(
    (field) =>
      field.contentTypes.length > 0 ||
      field.taxonomies.length > 0 ||
      field.comments,
    { message: Errors.FieldRequired, path: ['contentTypes'] },
  );

export type FieldDefinition = z.output<typeof fieldDefinitionSchema>;
export type FieldDefinitionInput = z.input<typeof fieldDefinitionSchema>;

/** Public description of a type (for archives and navigation) and its public fields. */
export const publicContentTypeSchema = z.object({
  key: z.string(),
  name: z.string(),
  pluralName: z.string(),
  description: z.string(),
  archive: z.boolean(),
  /** Listed in site search and feeds. */
  searchable: z.boolean().default(true),
  fields: z.array(
    z.object({ key: z.string(), label: z.string(), type: z.enum(FIELD_TYPES) }),
  ),
});

export type PublicContentType = z.output<typeof publicContentTypeSchema>;
