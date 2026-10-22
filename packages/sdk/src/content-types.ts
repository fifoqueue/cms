import { z } from 'zod';
import { KEBAB_CASE } from '#sdk/common';
import { isJsonValue } from '#sdk/common';
import { Errors } from '#sdk/errors';

/** Types every site has. They cannot be removed, and their keys are reserved. */
export const BUILTIN_CONTENT_TYPES = ['post', 'article', 'page'] as const;

/** A content type key: built-in or administrator-defined, kebab-case. */
export const contentTypeKeySchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .max(32)
  .regex(KEBAB_CASE);

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
export const contentTypeInputSchema = contentTypeSchema.omit({ builtin: true });

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

/** A custom field shown in the editor for the listed content types. */
export const fieldDefinitionSchema = z
  .object({
    key: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .regex(/^[a-z][a-z0-9_]*$/),
    label: z.string().trim().min(1).max(100),
    type: z.enum(FIELD_TYPES),
    /** Choices of a `select` field. */
    options: z.array(z.string().trim().min(1).max(100)).max(100).default([]),
    required: z.boolean().default(false),
    /** Served in the public API; otherwise kept for the administration only. */
    public: z.boolean().default(true),
    help: z.string().trim().max(300).default(''),
    contentTypes: z.array(contentTypeKeySchema).min(1).max(50),
  })
  .refine((field) => field.type !== 'select' || field.options.length > 0, {
    message: Errors.FieldOptionsRequired,
    path: ['options'],
  });

export type FieldDefinition = z.output<typeof fieldDefinitionSchema>;
export type FieldDefinitionInput = z.input<typeof fieldDefinitionSchema>;

/** Values of an entry's custom fields: plain JSON by key. */
export const fieldValuesSchema = z
  .record(z.string().max(64), z.unknown())
  .refine((values) => isJsonValue(values), Errors.FieldValuesInvalid);

export type FieldValues = Record<string, unknown>;

/** Public description of a type (for archives and navigation) and its public fields. */
export const publicContentTypeSchema = z.object({
  key: z.string(),
  name: z.string(),
  pluralName: z.string(),
  description: z.string(),
  archive: z.boolean(),
  fields: z.array(
    z.object({ key: z.string(), label: z.string(), type: z.enum(FIELD_TYPES) }),
  ),
});

export type PublicContentType = z.output<typeof publicContentTypeSchema>;
