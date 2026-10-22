import { childrenOf } from '@cms/sdk/tree';
export { descendantIds } from '@cms/sdk/tree';

export interface TreeTerm {
  id: string;
  name: string;
  parentId: string | null;
}

export interface TreeRow<T extends TreeTerm> {
  term: T;
  depth: number;
}

const byName = (a: TreeTerm, b: TreeTerm) => a.name.localeCompare(b.name);

/**
 * Terms in display order: each parent followed by its children (sorted by name), with their
 * depth. Terms whose parent is missing become roots; a parent cycle is cut where it is found,
 * so every term appears exactly once.
 */
export const flattenTree = <T extends TreeTerm>(
  terms: readonly T[],
): TreeRow<T>[] => {
  const ordered = [...terms].sort(byName);
  const known = new Set(ordered.map((term) => term.id));
  const children = childrenOf(ordered);

  const rows: TreeRow<T>[] = [];
  const seen = new Set<string>();
  const visit = (term: T) => {
    const pending: TreeRow<T>[] = [{ term, depth: 0 }];
    for (let row = pending.pop(); row; row = pending.pop()) {
      if (seen.has(row.term.id)) continue;
      seen.add(row.term.id);
      rows.push(row);
      const nested = children.get(row.term.id) ?? [];
      for (let index = nested.length - 1; index >= 0; index--)
        pending.push({ term: nested[index]!, depth: row.depth + 1 });
    }
  };
  for (const term of ordered)
    if (term.parentId === null || !known.has(term.parentId)) visit(term);
  for (const term of ordered) if (!seen.has(term.id)) visit(term);
  return rows;
};
