import type { TaxonomyType } from '@cms/sdk';
import { descendantIds } from '@cms/sdk/tree';
import { invalidInput, Errors } from '#api/shared/errors';

interface TermNode {
  id: string;
  taxonomy: TaxonomyType;
  parentId: string | null;
}

const parentError = (message: string) =>
  invalidInput(message, [{ path: 'parentId', message }]);

/**
 * Relation integrity shared by every `TaxonomyRepository`: throws `invalid_input` unless
 * `term.parentId` may be its parent. `lookup` reads a stored term (null when missing) and must
 * see a consistent hierarchy (adapters serialize hierarchy writes).
 */
export const checkParent = async (
  term: TermNode,
  lookup: (id: string) => Promise<TermNode | null>,
): Promise<void> => {
  if (term.parentId === null) return;
  if (term.taxonomy === 'tag') throw parentError(Errors.TermParentNotCategory);

  const seen = new Set([term.id]);

  for (let id: string | null = term.parentId; id !== null;) {
    if (seen.has(id)) throw parentError(Errors.TermParentCycle);
    seen.add(id);

    const node = await lookup(id);

    if (!node) throw parentError(Errors.TermParentNotFound);
    if (node.taxonomy !== term.taxonomy)
      throw parentError(Errors.TermParentOtherTaxonomy);
    id = node.parentId;
  }
};

/** `rootId` and the ids of every term below it. */
export const withDescendants = (
  terms: readonly { id: string; parentId: string | null }[],
  rootId: string,
): string[] => [...descendantIds(terms, rootId)];

/** Order of terms in every listing and in content: by name, then id. */
export const compareTerms = (
  a: { id: string; name: string },
  b: { id: string; name: string },
) =>
  a.name < b.name
    ? -1
    : a.name > b.name
      ? 1
      : a.id < b.id
        ? -1
        : a.id > b.id
          ? 1
          : 0;
