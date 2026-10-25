import { Embed } from '@cms/content';
import { safeHttpsUrl } from '@cms/content/urls';
import type { Node } from '@tiptap/pm/model';
import '#lib/admin/editor/editor.css';

/** The `Input` component's look, for the field built outside Svelte. */
const INPUT_CLASS =
  'dark:bg-input/30 border-input focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:aria-invalid:border-destructive/50 h-9 w-full min-w-0 rounded-md border bg-background px-2.5 py-1 text-base shadow-xs outline-none placeholder:text-muted-foreground focus-visible:ring-3 aria-invalid:ring-3 md:text-sm';

/**
 * The shared `embed` node with its address edited in place: an empty embed shows a URL field
 * (focused right after insertion), and clicking a filled one switches to the field. Enter or
 * leaving the field stores an `https:` address, Escape cancels. Only the display changes; the
 * schema, attributes and HTML stay shared.
 */
export const embedView = (hint: () => string) =>
  Embed.extend({
    addNodeView() {
      return ({ node, editor, getPos }) => {
        let current: Node = node;
        let editing = false;
        const dom = document.createElement('figure');
        dom.className = 'embed';
        dom.contentEditable = 'false';
        const field = document.createElement('label');
        field.className = 'not-prose grid gap-1 text-sm';
        const text = document.createElement('span');
        text.className = 'text-muted-foreground';
        const input = document.createElement('input');
        input.type = 'url';
        input.maxLength = 2048;
        input.placeholder = 'https://';
        input.spellcheck = false;
        input.className = INPUT_CLASS;
        field.append(text, input);
        const link = document.createElement('a');
        link.rel = 'noopener nofollow';

        const url = () =>
          typeof current.attrs.url === 'string' ? current.attrs.url : '';
        /** The field shows the stored address, without an error. */
        const reset = () => {
          input.value = url();
          input.removeAttribute('aria-invalid');
          text.classList.replace('text-destructive', 'text-muted-foreground');
        };
        const render = () => {
          if (editing || !url()) {
            text.textContent = hint();
            if (!field.isConnected) {
              reset();
              dom.replaceChildren(field);
            }
            return;
          }
          link.href = url();
          link.textContent = url();
          dom.replaceChildren(link);
        };
        const edit = () => {
          editing = true;
          render();
          input.focus();
          input.select();
        };
        /** Leaves the field; the editor gets focus back with the block selected. */
        const close = () => {
          editing = false;
          render();
          const pos = getPos();
          if (typeof pos === 'number')
            editor.chain().focus().setNodeSelection(pos).run();
        };
        const commit = (leaving: boolean) => {
          const value = input.value.trim();
          const valid = /^https:\/\//i.test(value) ? safeHttpsUrl(value) : null;
          if (!valid) {
            // Leaving an untouched field is not an error; a filled block keeps its address.
            if (leaving && !value) {
              editing = false;
              render();
              return;
            }
            input.setAttribute('aria-invalid', 'true');
            text.classList.replace('text-muted-foreground', 'text-destructive');
            return;
          }
          const pos = getPos();
          editing = false;
          if (typeof pos !== 'number') return;
          editor.view.dispatch(
            editor.state.tr.setNodeMarkup(pos, undefined, {
              ...current.attrs,
              url: valid,
            }),
          );
          if (!leaving) close();
        };

        input.addEventListener('keydown', (event) => {
          // The editor's own key handlers (and the slash menu) stay out of the field.
          event.stopPropagation();
          if (event.isComposing) return;
          if (event.key === 'Enter') {
            // Enter in a field would submit the content form.
            event.preventDefault();
            commit(false);
          } else if (event.key === 'Escape') {
            event.preventDefault();
            input.value = url();
            close();
          }
        });
        input.addEventListener('input', () => {
          input.removeAttribute('aria-invalid');
          text.classList.replace('text-destructive', 'text-muted-foreground');
        });
        input.addEventListener('blur', () => {
          if (editing || !url()) commit(true);
        });
        // A click edits the address; the link must not navigate away from the editor.
        dom.addEventListener('click', (event) => {
          if (field.contains(event.target as Element)) return;
          event.preventDefault();
          edit();
        });

        render();
        // Right after insertion (the editor has focus), go straight to the field. Waits a
        // frame for the inserting command's own focus to land first.
        if (!url())
          requestAnimationFrame(() => {
            if (editor.view.hasFocus() && field.isConnected) edit();
          });
        return {
          dom,
          update(next) {
            if (next.type !== current.type) return false;
            const changed = next.attrs.url !== current.attrs.url;
            current = next;
            // A new address (the options panel, undo, or this field's own commit) replaces
            // whatever the field holds. Editing ends and the field is reset before the swap,
            // so a blur it causes finds nothing to store.
            if (changed) {
              editing = false;
              reset();
            }
            render();
            return true;
          },
          selectNode: () => dom.classList.add('ProseMirror-selectednode'),
          deselectNode: () => dom.classList.remove('ProseMirror-selectednode'),
          stopEvent: (event) => field.contains(event.target as Element),
          ignoreMutation: () => true,
        };
      };
    },
  });
