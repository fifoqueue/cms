import {
  collectHeadings,
  TableOfContents,
  tocDefaults,
  tocHTML,
  tocPage,
  validTocCount,
} from '@cms/content/toc';
import type { Transaction } from '@tiptap/pm/state';

/** A live view only: the persisted schema and attributes stay identical to the API's. */
export const tocView = (empty: () => string) =>
  TableOfContents.extend({
    addNodeView() {
      return ({ node, editor, getPos }) => {
        let current = node;
        const dom = document.createElement('div');
        dom.contentEditable = 'false';
        dom.className = 'cms-toc-preview';
        const render = () => {
          const pos = getPos();
          if (typeof pos !== 'number') return;
          if (!validTocCount(editor.state.doc.toJSON())) {
            dom.textContent = empty();
            return;
          }
          // tocHTML calls the shared tocOutline, including filters and the threshold.
          const html = tocHTML(
            collectHeadings(editor.state.doc),
            { ...tocDefaults, ...current.attrs },
            tocPage(editor.state.doc, pos),
          );
          dom.innerHTML = html;
          if (!html) {
            const placeholder = document.createElement('p');
            placeholder.className = 'cms-toc';
            placeholder.textContent = empty();
            dom.append(placeholder);
          }
        };
        const changed = ({ transaction }: { transaction: Transaction }) => {
          if (transaction.docChanged) render();
        };
        dom.onmousedown = (event) => {
          const pos = getPos();
          if (typeof pos !== 'number') return;
          event.preventDefault();
          editor.chain().focus().setNodeSelection(pos).run();
        };
        // Preview links must not navigate away from the editor.
        dom.onclick = (event) => {
          if ((event.target as Element).closest('a')) event.preventDefault();
        };
        editor.on('transaction', changed);
        render();
        return {
          dom,
          update(next) {
            if (next.type !== current.type) return false;
            current = next;
            render();
            return true;
          },
          selectNode: () => dom.classList.add('ProseMirror-selectednode'),
          deselectNode: () => dom.classList.remove('ProseMirror-selectednode'),
          ignoreMutation: () => true,
          destroy: () => {
            editor.off('transaction', changed);
          },
        };
      };
    },
  });
