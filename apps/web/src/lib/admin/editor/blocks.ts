import type { Editor, JSONContent } from '@tiptap/core';
import type { AdminMedia } from '@cms/sdk';
import type { MediaChoice } from '#lib/admin/MediaPicker.svelte';

/** An image node for a library file at the size, alt text and caption chosen for it. */
export const imageNode = (
  media: AdminMedia,
  choice: MediaChoice,
): JSONContent => ({
  type: 'image',
  attrs: {
    src: choice.variant?.url ?? media.url,
    alt: choice.alt,
    mediaId: media.id,
    width: choice.variant?.width ?? media.width,
    height: choice.variant?.height ?? media.height,
    ...(choice.caption ? { caption: choice.caption } : {}),
  },
});

/** A body node for a library file; every insertion path builds images the same way. */
export const mediaNode = (
  media: AdminMedia,
  choice: MediaChoice,
): JSONContent =>
  media.kind === 'image'
    ? imageNode(media, choice)
    : {
        type: media.kind === 'document' ? 'file' : media.kind,
        attrs: {
          src: media.url,
          mediaId: media.id,
          ...(media.kind === 'document' && {
            name: media.filename,
            download: true,
          }),
        },
      };

const configurable = new Set([
  'paragraph',
  'heading',
  'codeBlock',
  'tableOfContents',
  // Images have their own settings bar in the editor (alt, size, caption, alignment, link).
  'video',
  'file',
  'gallery',
  'columns',
  'buttons',
  'button',
  'details',
  'pullquote',
  'callout',
  'spacer',
  'table',
  'embed',
  'pluginBlock',
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
