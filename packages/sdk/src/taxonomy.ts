import { z } from 'zod';
import { CONTENT_SLUG, KEBAB_CASE } from '#sdk/common';
import {
  adminEntrySeoSchema,
  publicEntrySeoSchema,
  seoInputSchema,
} from '#sdk/seo';

/** Categories are hierarchical, tags are flat (WordPress semantics). */
export const TAXONOMY_TYPES = ['category', 'tag'] as const;

const customTaxonomyKeySchema = z.string().min(1).max(32).regex(KEBAB_CASE);
export const taxonomyTypeSchema = z.union([
  customTaxonomyKeySchema,
  z
    .string()
    .max(136)
    .regex(/^plugin:[a-z0-9]+(?:-[a-z0-9]+)*:[a-z0-9]+(?:-[a-z0-9]+)*$/),
]);

export type TaxonomyType = z.output<typeof taxonomyTypeSchema>;

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
});

export type PublicTaxonomyTerm = z.output<typeof publicTaxonomyTermSchema>;

/** A term as served by the admin API. Allowlist: undeclared keys are stripped. */
export const adminTaxonomyTermSchema = z.object({
  ...termShape,
  createdAt: z.string(),
  updatedAt: z.string(),
  seo: adminEntrySeoSchema,
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
});

export type TaxonomyInput = z.input<typeof taxonomyInputSchema>;
/** Validated term input, with defaults applied. */
export type TaxonomyData = z.output<typeof taxonomyInputSchema>;
