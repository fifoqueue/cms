import type { PluginBlockInfo } from '@cms/sdk';
import { PluginBlock } from '@cms/content';

let loading: Promise<PluginBlockInfo[]> | null = null;

/** Active plugin blocks, fetched once per page; none when the request fails. */
export const loadPluginBlocks = () =>
  (loading ??= fetch('/admin/content/plugin-blocks')
    .then((response) =>
      response.ok ? (response.json() as Promise<PluginBlockInfo[]>) : [],
    )
    .catch(() => [])) as Promise<PluginBlockInfo[]>;

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
        return ({ node }) => {
          const dom = document.createElement('div');
          dom.className =
            'my-3 rounded-md border border-dashed p-3 text-sm text-muted-foreground';
          dom.contentEditable = 'false';
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
