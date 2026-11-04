import { z } from 'zod';
import { KEBAB_CASE } from '#sdk/common';

// Kept apart from `#sdk/taxonomy` so content type and field schemas can name taxonomies
// without importing term DTOs (which depend on SEO and, through it, on content types).
export const customTaxonomyKeySchema = z
  .string()
  .min(1)
  .max(32)
  .regex(KEBAB_CASE);

export const taxonomyTypeSchema = z.union([
  customTaxonomyKeySchema,
  z
    .string()
    .max(136)
    .regex(/^plugin:[a-z0-9]+(?:-[a-z0-9]+)*:[a-z0-9]+(?:-[a-z0-9]+)*$/),
]);

export type TaxonomyType = z.output<typeof taxonomyTypeSchema>;
