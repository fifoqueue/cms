import type { AdminTaxonomyTerm, PublicTaxonomyTerm } from '@cms/sdk';
import { adminTaxonomyTermSchema, publicTaxonomyTermSchema } from '@cms/sdk';
import { toAdminSeo, toPublicSeo } from '#api/domain/seo/seo-mapper';
import type { CountedTermRecord } from '#api/domain/taxonomy/taxonomy-repository';

// Every DTO lists its fields explicitly, so nothing stored leaks into a response.
export const toPublicTerm = (record: CountedTermRecord): PublicTaxonomyTerm =>
  publicTaxonomyTermSchema.parse({
    id: record.id,
    taxonomy: record.taxonomy,
    name: record.name,
    slug: record.slug,
    description: record.description,
    parentId: record.parentId,
    count: record.count,
    seo: toPublicSeo(record.seo),
  });

export const toAdminTerm = (record: CountedTermRecord): AdminTaxonomyTerm =>
  adminTaxonomyTermSchema.parse({
    id: record.id,
    taxonomy: record.taxonomy,
    name: record.name,
    slug: record.slug,
    description: record.description,
    parentId: record.parentId,
    count: record.count,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    seo: toAdminSeo(record.seo),
  });
