import type { Editor, JSONContent } from '@tiptap/core';
import type { AdminMedia } from '@cms/sdk';

export const mediaNode = (media: AdminMedia): JSONContent => ({
  type: media.kind === 'document' ? 'file' : media.kind,
  attrs: {
    src:
      media.kind === 'image'
        ? (media.variants.find((item) => item.name === 'large')?.url ??
          media.url)
        : media.url,
    mediaId: media.id,
    ...(media.kind === 'image' && {
      alt: media.alt,
      width: media.width,
      height: media.height,
      caption: media.caption,
    }),
    ...(media.kind === 'document' && { name: media.filename, download: true }),
  },
});

const configurable = new Set([
  'paragraph',
  'heading',
  // Images have their own settings bar in the editor (alt, size, caption, alignment, link).
  'video',
  'file',
  'gallery',
  'columns',
  'buttons',
  'button',
  'details',
  'pullquote',
  'spacer',
  'table',
  'embed',
]);

/** The selected atom plus configurable enclosing blocks, so gallery/column controls stay reachable. */
export const blockTargets = (editor: Editor) => {
  const { selection, doc } = editor.state;
  const node = doc.nodeAt(selection.from);
  const targets =
    node && configurable.has(node.type.name)
      ? [{ node, pos: selection.from }]
      : [];
  for (let depth = selection.$from.depth; depth > 0; depth -= 1) {
    const parent = selection.$from.node(depth);
    if (configurable.has(parent.type.name))
      targets.push({ node: parent, pos: selection.$from.before(depth) });
  }
  return targets;
};

/** Reducing the number of columns moves removed content into the last retained column. */
export const resizeColumns = (editor: Editor, pos: number, count: number) => {
  const node = editor.state.doc.nodeAt(pos);
  if (
    node?.type.name !== 'columns' ||
    !Number.isInteger(count) ||
    count < 2 ||
    count > 4
  )
    return;
  const columns = node.toJSON().content as JSONContent[];
  while (columns.length < count)
    columns.push({ type: 'column', content: [{ type: 'paragraph' }] });
  const removed = columns.splice(count);
  if (removed.length)
    columns[count - 1]!.content = [
      ...(columns[count - 1]!.content ?? []),
      ...removed.flatMap((column) => column.content ?? []),
    ];
  editor.commands.insertContentAt(
    { from: pos, to: pos + node.nodeSize },
    { type: 'columns', attrs: node.attrs, content: columns },
  );
};
