import type { TaxonomyType, TermSummary } from '@cms/sdk';

export const extraTerms = (
  terms: { term: TermSummary & { taxonomy: TaxonomyType } }[],
) =>
  terms
    .filter(
      ({ term }) => term.taxonomy !== 'category' && term.taxonomy !== 'tag',
    )
    .map(({ term }) => ({
      id: term.id,
      name: term.name,
      slug: term.slug,
      taxonomy: term.taxonomy,
    }));
