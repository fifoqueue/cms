import { parseDocument } from '@cms/content';
import type { ContentDocument } from '@cms/sdk';
import type { HookDispatcher } from '#api/domain/ports';
import { invalidInput, Errors } from '#api/shared/errors';

let core: string[] | undefined;

export const allowedBlocks = async (
  hooks: HookDispatcher,
  type: string,
  userId: string,
  plugins: string[],
) => {
  core ??= Object.keys(
    parseDocument({ type: 'doc', content: [{ type: 'paragraph' }] }).type.schema
      .nodes,
  ).filter((name) => !['doc', 'text', 'pluginBlock'].includes(name));
  const blocks = [...core, ...plugins];
  const value = { type, userId, blocks };

  if (!hooks.has('editor.allowedBlocks')) return value;

  const registered = new Set(blocks);

  return hooks.applyFilter('editor.allowedBlocks', value, (candidate) => {
    if (!candidate || typeof candidate !== 'object') return false;

    const next = candidate as typeof value;

    return (
      next.type === type &&
      next.userId === userId &&
      Array.isArray(next.blocks) &&
      next.blocks.every(
        (name) => typeof name === 'string' && registered.has(name),
      ) &&
      new Set(next.blocks).size === next.blocks.length
    );
  });
};

export const assertAllowedBlocks = (
  document: ContentDocument,
  blocks: string[],
) => {
  const allowed = new Set(blocks);
  const visit = (node: Record<string, unknown>, path: string): void => {
    const attrs = node.attrs as Record<string, unknown> | undefined;
    const name = node.type === 'pluginBlock' ? attrs?.block : node.type;

    if (
      node.type !== 'text' &&
      (typeof name !== 'string' || !allowed.has(name))
    )
      throw invalidInput(Errors.EditorBlockDisallowed, [
        { path, message: Errors.EditorBlockDisallowed },
      ]);

    if (Array.isArray(node.content))
      node.content.forEach((child, index) =>
        visit(child as Record<string, unknown>, `${path}.content.${index}`),
      );
  };

  document.content?.forEach((node, index) =>
    visit(node, `document.content.${index}`),
  );
};
