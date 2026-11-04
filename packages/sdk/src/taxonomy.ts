import { z } from 'zod';
import { CONTENT_SLUG } from '#sdk/common';
import { fieldValuesSchema } from '#sdk/field-values';
import {
  adminEntrySeoSchema,
  publicEntrySeoSchema,
  seoInputSchema,
} from '#sdk/seo';
import {
  customTaxonomyKeySchema,
  taxonomyTypeSchema,
} from '#sdk/taxonomy-keys';

export { taxonomyTypeSchema } from '#sdk/taxonomy-keys';
export type { TaxonomyType } from '#sdk/taxonomy-keys';

/** Categories are hierarchical, tags are flat. */
export const TAXONOMY_TYPES = ['category', 'tag'] as const;

export const taxonomyDefinitionSchema = z.object({
  key: taxonomyTypeSchema,
  name: z.string().trim().min(1).max(191),
  hierarchical: z.boolean().default(true),
});

export const taxonomyDefinitionInputSchema = taxonomyDefinitionSchema.extend({
  key: customTaxonomyKeySchema,
});

export type TaxonomyDefinition = z.output<typeof taxonomyDefinitionSchema>;
export type TaxonomyDefinitionInput = z.input<
  typeof taxonomyDefinitionInputSchema
>;

/** A term as embedded in content. Undeclared keys are stripped (public content uses a strict copy). */
export const termSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
});

export type TermSummary = z.output<typeof termSummarySchema>;

export const extraTermSummarySchema = termSummarySchema
  .extend({ taxonomy: taxonomyTypeSchema })
  .strict();

export type ExtraTermSummary = z.output<typeof extraTermSummarySchema>;

const termShape = {
  id: z.string(),
  taxonomy: taxonomyTypeSchema,
  name: z.string(),
  slug: z.string(),
  description: z.string(),
  parentId: z.string().nullable(),
  /** Assigned content: published items only in the public API, every item in the admin API. */
  count: z.number().int().min(0),
};

/** A term as served by the public API. Allowlist: undeclared keys are stripped. */
export const publicTaxonomyTermSchema = z.object({
  ...termShape,
  seo: publicEntrySeoSchema,
  /** Public term fields of the taxonomy by key (image fields as `PublicImage`). */
  fields: z.record(z.string(), z.unknown()).default({}),
});

export type PublicTaxonomyTerm = z.output<typeof publicTaxonomyTermSchema>;

/** A term as served by the admin API. Allowlist: undeclared keys are stripped. */
export const adminTaxonomyTermSchema = z.object({
  ...termShape,
  createdAt: z.string(),
  updatedAt: z.string(),
  seo: adminEntrySeoSchema,
  /** Stored term field values by key, including those of fields no longer declared. */
  fields: z.record(z.string(), z.unknown()).default({}),
});

export type AdminTaxonomyTerm = z.output<typeof adminTaxonomyTermSchema>;

/**
 * What clients send when creating or replacing a term. The taxonomy comes from the URL and
 * never changes. Omitting `slug` generates one on create and keeps the current one on update.
 * Only hierarchical taxonomies may have a parent.
 */
export const taxonomyInputSchema = z.object({
  name: z.string().trim().min(1).max(191),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .normalize('NFC')
    .max(191)
    .regex(CONTENT_SLUG)
    .optional(),
  description: z.string().trim().max(1000).default(''),
  parentId: z.string().trim().min(1).max(36).nullable().default(null),
  /** Omission preserves existing SEO on update. */
  seo: seoInputSchema.optional(),
  /** Term field values, validated against the taxonomy's fields. Omission keeps them on update. */
  fields: fieldValuesSchema.optional(),
});

export type TaxonomyInput = z.input<typeof taxonomyInputSchema>;
/** Validated term input, with defaults applied. */
export type TaxonomyData = z.output<typeof taxonomyInputSchema>;

export const TERM_ORDERS = ['name', 'slug', 'count', 'createdAt'] as const;

/**
 * Arguments of a term list. Omitted keys keep the defaults: every
 * term of the taxonomy, empty ones included, by name ascending (ties by id).
 */
export const termQuerySchema = z.object({
  taxonomy: taxonomyTypeSchema,
  /** Direct children of this term only; null lists top-level terms only. */
  parentId: z.string().trim().min(1).max(36).nullable().optional(),
  /** Terms whose name or slug contains the text, compared as the store compares text. */
  search: z.string().trim().max(191).optional(),
  /** Leaves out terms without content in the list's count scope. */
  hideEmpty: z.boolean().optional(),
  orderBy: z.enum(TERM_ORDERS).optional(),
  order: z.enum(['asc', 'desc']).optional(),
});

export type TermQuery = z.output<typeof termQuerySchema>;

export const adminTermListQuerySchema = termQuerySchema.extend({
  parentId: z.preprocess(
    (value) => (value === 'null' ? null : value),
    termQuerySchema.shape.parentId,
  ),
  hideEmpty: z.preprocess(
    (value) => (value === 'true' ? true : value === 'false' ? false : value),
    termQuerySchema.shape.hideEmpty,
  ),
});
