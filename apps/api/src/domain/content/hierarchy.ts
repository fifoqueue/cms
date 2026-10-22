import { invalidInput, Errors } from '#api/shared/errors';

export interface ContentNode {
  id: string;
  type: string;
  parentId: string | null;
}

const parentError = () =>
  invalidInput(Errors.ContentParentInvalid, [
    { path: 'parentId', message: Errors.ContentParentInvalid },
  ]);

/** Adapters must serialize hierarchy writes so lookup sees a consistent ancestor chain. */
export const checkContentParent = async (
  node: ContentNode,
  lookup: (id: string) => Promise<ContentNode | null>,
): Promise<void> => {
  if (node.parentId === null) return;
  if (node.type !== 'page') throw parentError();

  const seen = new Set([node.id]);

  for (let id: string | null = node.parentId; id !== null;) {
    if (seen.has(id) || seen.size >= 100) throw parentError();
    seen.add(id);

    const parent = await lookup(id);

    if (!parent || parent.type !== 'page') throw parentError();
    id = parent.parentId;
  }
};
