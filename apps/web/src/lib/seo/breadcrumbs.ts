import type { PublicTaxonomyTerm } from '@cms/sdk';

/** Ancestors in root-first order; malformed cycles never repeat a term. */
export const termParents = (
  terms: readonly PublicTaxonomyTerm[],
  slug: string,
) => {
  const index = new Map(terms.map((term) => [term.id, term]));
  const current = terms.find((term) => term.slug === slug);
  const parents: { name: string; slug: string }[] = [];
  const seen = new Set(current ? [current.id] : []);
  let parentId = current?.parentId;

  while (parentId && !seen.has(parentId)) {
    seen.add(parentId);
    const parent = index.get(parentId);

    if (!parent) break;
    parents.unshift({ name: parent.name, slug: parent.slug });
    parentId = parent.parentId;
  }

  return parents;
};
