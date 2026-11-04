import type { JSONContent } from '@tiptap/core';

export const patternAllowed = (
  content: readonly JSONContent[] | null | undefined,
  allowed: readonly string[] | null,
): boolean => {
  if (allowed === null) return true;
  if (!content) return false;

  const names = new Set(allowed);
  const visit = (node: JSONContent): boolean => {
    const name = node.type === 'pluginBlock' ? node.attrs?.block : node.type;

    return (
      (node.type === 'text' || names.has(name ?? '')) &&
      (node.content ?? []).every(visit)
    );
  };

  return content.every(visit);
};
