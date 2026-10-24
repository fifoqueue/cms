import { Extension } from '@tiptap/core';
import type { Node } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import '#lib/admin/editor/editor.css';

const key = new PluginKey<DecorationSet>('blockLabels');

/**
 * Names blocks that would otherwise read as plain text while editing (`data-editor-label`,
 * shown by `editor.css`). Decorations only: the document and its HTML are unchanged.
 */
export const blockLabels = (
  types: readonly string[],
  label: (type: string) => string,
) =>
  Extension.create({
    name: 'blockLabels',
    addProseMirrorPlugins() {
      const build = (doc: Node) => {
        const decorations: Decoration[] = [];
        doc.descendants((node, pos) => {
          if (types.includes(node.type.name))
            decorations.push(
              Decoration.node(pos, pos + node.nodeSize, {
                'data-editor-label': label(node.type.name),
              }),
            );
        });
        return DecorationSet.create(doc, decorations);
      };
      return [
        new Plugin<DecorationSet>({
          key,
          state: {
            init: (_, state) => build(state.doc),
            apply: (tr, value) => (tr.docChanged ? build(tr.doc) : value),
          },
          props: { decorations: (state) => key.getState(state) },
        }),
      ];
    },
  });
