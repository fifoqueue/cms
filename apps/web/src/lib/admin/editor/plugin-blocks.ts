import type { PluginBlockInfo } from '@cms/sdk';
import { PluginBlock } from '@cms/content';

/** Read on mount so navigation reflects plugin activation changes; failures leave no choices. */
export const loadPluginBlocks = () =>
  fetch('/admin/content/plugin-blocks')
    .then((response) =>
      response.ok ? (response.json() as Promise<PluginBlockInfo[]>) : [],
    )
    .catch(() => []) as Promise<PluginBlockInfo[]>;

/**
 * The shared `pluginBlock` node with an editor placeholder: the block's title, or a notice
 * when its plugin is not active. The node and its attributes are kept either way. `refresh`
 * relabels shown blocks once the list of active blocks has loaded.
 */
export const pluginBlockView = (
  title: (block: string) => string | undefined,
  inactive: () => string,
) => {
  const shown = new Map<HTMLElement, string>();
  const label = (dom: HTMLElement, block: string) => {
    dom.textContent = title(block) ?? inactive();
  };
  return {
    extension: PluginBlock.extend({
      addNodeView() {
        return ({ node, editor, getPos }) => {
          const dom = document.createElement('div');
          dom.className =
            'my-3 cursor-pointer rounded-md border border-dashed p-3 text-sm text-muted-foreground';
          dom.contentEditable = 'false';
          dom.onmousedown = (event) => {
            const pos = getPos();
            if (typeof pos !== 'number') return;
            event.preventDefault();
            editor.chain().focus().setNodeSelection(pos).run();
          };
          const block = String(node.attrs.block ?? '');
          shown.set(dom, block);
          label(dom, block);
          return { dom, destroy: () => void shown.delete(dom) };
        };
      },
    }),
    refresh: () => {
      for (const [dom, block] of shown) label(dom, block);
    },
  };
};
