/** Pure taxonomy traversal shared by the API and editor; no runtime schema dependencies. */
export interface TreeNode {
  id: string;
  parentId: string | null;
}

/** Children in input order, indexed once instead of scanning the whole collection per node. */
export const childrenOf = <T extends TreeNode>(terms: readonly T[]) => {
  const children = new Map<string | null, T[]>();
  for (const term of terms) {
    const siblings = children.get(term.parentId);
    if (siblings) siblings.push(term);
    else children.set(term.parentId, [term]);
  }
  return children;
};

/** The root and descendants, once each in breadth-first order, including cyclic input safely. */
export const descendantIds = (
  terms: readonly TreeNode[],
  root: string,
): Set<string> => {
  const children = childrenOf(terms);
  const found = new Set([root]);
  // Set iteration visits newly inserted children and never visits an existing id twice.
  for (const parent of found)
    for (const child of children.get(parent) ?? []) found.add(child.id);
  return found;
};
