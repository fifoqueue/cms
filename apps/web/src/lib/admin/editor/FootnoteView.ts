import { contentExtensions } from '@cms/content';
import type { FootnoteGroup } from '@cms/sdk/footnotes';
import type { Node } from '@tiptap/core';
import { closeHistory } from '@tiptap/pm/history';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { NodeSelection, Plugin, TextSelection } from '@tiptap/pm/state';
import type { EditorState, Transaction } from '@tiptap/pm/state';
import {
  footnotePages,
  footnoteSource,
} from '#lib/admin/editor/footnote-notes.js';
import { buttonVariants } from '#lib/components/ui/button/index.js';
import '#lib/admin/editor/editor.css';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    footnoteView: {
      /** Adds an empty footnote after the selection and opens its text field. */
      insertFootnote: () => ReturnType;
    };
  }
}

export interface FootnoteLabels {
  /** A footnote by its label: its page-local number or its name. */
  number: (label: string) => string;
  /** Accessible name of a footnote: its label and (resolved) text. */
  label: (label: string, text: string) => string;
  /** How to open the field: click, or select it with the arrow keys and press Enter. */
  open: string;
  placeholder: string;
  hint: string;
  /** The `[* note]`, `[*name note]` and `[*name]` shortcuts, shown for a new footnote. */
  syntax: string;
  remove: string;
  empty: string;
}

/** The `Textarea` component's look, for the field built outside Svelte. */
const TEXTAREA_CLASS =
  'border-input dark:bg-input/30 focus-visible:border-ring focus-visible:ring-ring/50 rounded-md border bg-background px-2.5 py-2 text-base shadow-xs outline-none focus-visible:ring-3 field-sizing-content min-h-16 max-h-60 w-full resize-none placeholder:text-muted-foreground';

const Footnote = contentExtensions.find(
  (extension) => extension.name === 'footnote',
) as Node;

/** Meta naming the position of a footnote whose field opens with this transaction. */
const OPEN = 'footnoteOpen';

/**
 * A transaction that trims footnote texts, drops names the API would refuse and removes blank
 * numbered footnotes, wherever they came from (HTML mode, paste, loaded content), except those
 * at `kept` (open fields, which store or remove their own footnote). Named references without
 * text stay. Null when every footnote is already valid.
 */
const repairFootnotes = (
  state: EditorState,
  kept: ReadonlySet<number>,
  shortened?: (labels: string[]) => void,
) => {
  const invalid: {
    pos: number;
    node: ProseMirrorNode;
    repaired: { name: unknown; text: string } | null;
  }[] = [];
  let anonymous: unknown;
  state.doc.descendants((node, pos) => {
    if (node.type.name !== 'footnote' || kept.has(pos)) return;
    const source = footnoteSource(node.attrs);
    // The schema's default name marks a numbered note.
    if (source && source.name === undefined)
      anonymous ??= node.type.create().attrs.name;
    const repaired = source && {
      name: source.name ?? anonymous,
      text: source.text,
    };
    if (
      !repaired ||
      repaired.text !== node.attrs.text ||
      repaired.name !== node.attrs.name
    )
      invalid.push({ pos, node, repaired });
  });
  if (!invalid.length) return null;
  const tr = state.tr;
  const cut: number[] = [];
  // From the end, so earlier positions stay valid.
  for (const { pos, node, repaired } of invalid.reverse()) {
    if (repaired)
      tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...repaired });
    else tr.delete(pos, pos + node.nodeSize);
    if (repaired && repaired.text !== String(node.attrs.text).trim())
      cut.push(pos);
  }
  // Labeled as they show once repaired.
  if (cut.length && shortened) {
    const { notes } = footnotePages(tr.doc);
    shortened(
      cut
        .reverse()
        .flatMap((pos) => notes.get(tr.mapping.map(pos))?.label ?? []),
    );
  }
  return tr;
};

let panels = 0;

interface FootnoteStorage {
  /** Positions of footnotes whose field is open (or opening), read when repairing. */
  open: Set<() => number | undefined>;
}

/**
 * The shared `footnote` node shown with its live page-local label (number, or the name a
 * `[*name …]` note defines); hovering or selecting it shows the note's text — for a named
 * reference without text of its own, the text its name defines. Clicking it (or Enter while
 * selected) opens a field to edit its own text or delete it. Enter or leaving the field stores
 * the text, Escape cancels. An empty numbered footnote is never kept, and never enters the
 * undo history: a new one is added outside it and stored on its first text as a fresh
 * insertion; a named one may be emptied and stays a reference. Footnotes from any other source
 * are kept valid too: their text is trimmed and blank numbered ones are removed, so the
 * document always passes the API's check. Only the display changes; schema, shortcuts and HTML
 * stay shared.
 */
export const footnoteView = (
  labels: () => FootnoteLabels,
  /** Footnotes (by label) whose text had to be cut to 2000 characters. */
  shortened: (labels: string[]) => void,
) =>
  Footnote.extend<Record<string, never>, FootnoteStorage>({
    addStorage() {
      return { open: new Set() };
    },
    onCreate(event) {
      this.parent?.(event);
      // Loaded content; outside the history, so undo cannot bring blank footnotes back.
      const tr = repairFootnotes(this.editor.state, new Set(), shortened);
      if (tr) this.editor.view.dispatch(tr.setMeta('addToHistory', false));
    },
    addProseMirrorPlugins() {
      return [
        ...(this.parent?.() ?? []),
        new Plugin({
          // Runs with the changing transaction, so its history entry (or exclusion) applies
          // to the repair too and undo groups stay as they were.
          appendTransaction: (transactions, oldState, state) => {
            if (!transactions.some((tr) => tr.docChanged)) return null;
            const kept = new Set<number>();
            const later = (index: number, pos: number) =>
              transactions
                .slice(index + 1)
                .reduce((at, tr) => tr.mapping.map(at), pos);
            // Open fields, by their position before these transactions.
            for (const position of this.storage.open) {
              const pos = position();
              if (typeof pos === 'number' && pos < oldState.doc.content.size)
                kept.add(later(-1, pos));
            }
            // A footnote being inserted, whose field opens right after.
            transactions.forEach((tr, index) => {
              const pos = tr.getMeta(OPEN) as number | undefined;
              if (pos !== undefined) kept.add(later(index, pos));
            });
            return repairFootnotes(state, kept, shortened);
          },
        }),
      ];
    },
    addCommands() {
      return {
        insertFootnote:
          () =>
          ({ tr, dispatch }) => {
            // After the selection, so selected text is kept (the note usually follows it).
            const pos = tr.selection.to;
            const $pos = tr.doc.resolve(pos);
            if (
              !$pos.parent.canReplaceWith($pos.index(), $pos.index(), this.type)
            )
              return false;
            if (dispatch)
              tr.insert(pos, this.type.create())
                .setSelection(NodeSelection.create(tr.doc, pos))
                .setMeta('addToHistory', false)
                .setMeta(OPEN, pos);
            return true;
          },
      };
    },
    addKeyboardShortcuts() {
      return {
        ...this.parent?.(),
        'Mod-Alt-f': () => this.editor.commands.insertFootnote(),
        // A selected footnote opens its field instead of being replaced by a new line.
        Enter: () => {
          const { state, view } = this.editor;
          const { selection } = state;
          if (
            !(selection instanceof NodeSelection) ||
            selection.node.type !== this.type
          )
            return false;
          view.dispatch(state.tr.setMeta(OPEN, selection.from));
          return true;
        },
      };
    },
    addNodeView() {
      const open = this.storage.open;
      return ({ node, editor, view, getPos }) => {
        let current: ProseMirrorNode = node;
        let editing = false;
        /** The note this footnote shows: its label and resolved text. */
        let note: FootnoteGroup | undefined;
        const position = () => getPos();
        const dom = document.createElement('span');
        dom.className = 'cms-editor-footnote';
        dom.contentEditable = 'false';
        // The number is the edit button. It is not a tab stop, so caret movement stays
        // ProseMirror's: the arrow keys select it and Enter opens the field.
        const mark = document.createElement('sup');
        mark.setAttribute('role', 'button');
        mark.setAttribute('aria-haspopup', 'dialog');
        mark.setAttribute('aria-expanded', 'false');
        const tip = document.createElement('span');
        tip.className = 'cms-editor-footnote-tip';
        tip.setAttribute('aria-hidden', 'true');
        const tipText = document.createElement('span');
        const tipHint = document.createElement('span');
        tipHint.className = 'cms-editor-footnote-tip-hint';
        tip.append(tipText, tipHint);
        dom.append(mark, tip);

        const panel = document.createElement('span');
        panel.className = 'cms-editor-footnote-panel not-prose';
        panel.id = `cms-footnote-panel-${++panels}`;
        panel.setAttribute('role', 'dialog');
        mark.setAttribute('aria-controls', panel.id);
        const heading = document.createElement('span');
        heading.className = 'font-medium';
        const field = document.createElement('textarea');
        field.maxLength = 2000;
        field.rows = 3;
        field.className = TEXTAREA_CLASS;
        const syntax = document.createElement('span');
        syntax.className = 'text-sm text-muted-foreground';
        const footer = document.createElement('span');
        footer.className = 'flex items-center justify-between gap-2';
        const hint = document.createElement('span');
        hint.className = 'text-sm text-muted-foreground';
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = buttonVariants({
          variant: 'destructive',
          size: 'sm',
        });
        footer.append(hint, remove);
        panel.append(heading, field, syntax, footer);

        /** Its own stored text; a named reference may have none. */
        const text = () =>
          typeof current.attrs.text === 'string' ? current.attrs.text : '';
        /** The name it defines or reuses; undefined for a numbered note. */
        const name = () => footnoteSource(current.attrs)?.name;
        const label = () => note?.label ?? '*';
        const resolved = () => note?.text || text();
        const render = () => {
          const { label: describe, empty, open: how } = labels();
          mark.textContent = label();
          mark.setAttribute(
            'aria-label',
            describe(label(), resolved() || empty),
          );
          mark.setAttribute('aria-description', how);
          tipText.textContent = resolved() || empty;
          tipHint.textContent = how;
          dom.toggleAttribute('data-empty', !resolved());
        };
        const renumber = () => {
          const pos = getPos();
          if (typeof pos !== 'number') return;
          note = footnotePages(view.state.doc).notes.get(pos);
          render();
        };
        /** The field shows the stored text. */
        const reset = () => {
          field.value = text();
        };
        /** Keeps the panel inside the writing area. */
        const place = () => {
          panel.style.translate = '';
          const bounds = view.dom.getBoundingClientRect();
          const box = panel.getBoundingClientRect();
          const shift = Math.max(
            Math.min(0, bounds.right - box.right),
            bounds.left - box.left,
          );
          panel.style.translate = `${shift}px 0`;
        };
        const edit = () => {
          if (!editing) {
            editing = true;
            open.add(position);
            const {
              number: title,
              placeholder,
              hint: help,
              syntax: shortcuts,
            } = labels();
            const named = name() !== undefined;
            heading.textContent = title(label());
            panel.setAttribute('aria-label', title(label()));
            mark.setAttribute('aria-expanded', 'true');
            // A reference without text of its own shows the note it reuses.
            field.placeholder = (named && !text() && note?.text) || placeholder;
            field.setAttribute('aria-label', title(label()));
            syntax.textContent = shortcuts;
            syntax.hidden = named || text() !== '';
            hint.textContent = help;
            remove.textContent = labels().remove;
            reset();
            dom.classList.add('is-editing');
            dom.append(panel);
            place();
          }
          field.focus();
          field.setSelectionRange(field.value.length, field.value.length);
        };
        /** Closes the field; a blur this causes finds nothing to store. */
        const hide = () => {
          editing = false;
          open.delete(position);
          mark.setAttribute('aria-expanded', 'false');
          dom.classList.remove('is-editing');
          panel.remove();
        };
        /** Back to the text, with the caret at `pos` when the author stays in the editor. */
        const finish = (tr: Transaction, pos: number | null) => {
          if (pos !== null) tr.setSelection(TextSelection.create(tr.doc, pos));
          view.dispatch(tr);
          if (pos !== null) view.focus();
        };
        const removeAt = (pos: number, leaving: boolean) => {
          const tr = view.state.tr.delete(pos, pos + current.nodeSize);
          // An empty new note was never in the history, so removing it stays out of it too.
          if (!text() && name() === undefined)
            tr.setMeta('addToHistory', false);
          else closeHistory(tr);
          finish(tr, leaving ? null : pos);
        };
        const commit = (leaving: boolean) => {
          const value = field.value.trim();
          const stored = text();
          hide();
          const pos = getPos();
          if (typeof pos !== 'number') return;
          const caret = leaving ? null : pos + current.nodeSize;
          const named = name() !== undefined;
          // Emptied, a named note stays a reference to its name; a numbered one goes.
          if (!value && !named) return removeAt(pos, leaving);
          if (value === stored) {
            if (caret !== null) finish(view.state.tr, caret);
            return;
          }
          if (stored || named) {
            finish(
              closeHistory(
                view.state.tr.setNodeMarkup(pos, undefined, {
                  ...current.attrs,
                  text: value,
                }),
              ),
              caret,
            );
            return;
          }
          // The first text: the empty note leaves outside the history and the filled one is
          // inserted inside it, so undo removes the footnote instead of emptying it.
          view.dispatch(
            view.state.tr
              .delete(pos, pos + current.nodeSize)
              .setMeta('addToHistory', false),
          );
          const tr = view.state.tr.insert(
            pos,
            current.type.create({ ...current.attrs, text: value }),
          );
          finish(closeHistory(tr), caret);
        };

        field.addEventListener('keydown', (event) => {
          // The editor's own key handlers (and the slash menu) stay out of the field.
          event.stopPropagation();
          if (event.isComposing) return;
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            commit(false);
          } else if (event.key === 'Escape') {
            event.preventDefault();
            reset();
            commit(false);
          }
        });
        // Leaving the panel stores the text; moving to its delete button does not.
        panel.addEventListener('focusout', (event) => {
          if (editing && !panel.contains(event.relatedTarget as Element | null))
            commit(true);
        });
        // The field keeps focus while the button is pressed, so nothing is stored first.
        remove.addEventListener('mousedown', (event) => event.preventDefault());
        remove.addEventListener('click', () => {
          hide();
          const pos = getPos();
          if (typeof pos === 'number') removeAt(pos, false);
        });
        dom.addEventListener('click', (event) => {
          if (!panel.contains(event.target as Element)) edit();
        });

        const changed = ({ transaction }: { transaction: Transaction }) => {
          if (transaction.docChanged) renumber();
          const opening = transaction.getMeta(OPEN) as number | undefined;
          if (opening === undefined || opening !== getPos()) return;
          // Kept (not repaired away while empty) until its field opens.
          open.add(position);
          // Waits a frame for the inserting command's own focus to land first.
          requestAnimationFrame(() => {
            if (dom.isConnected) edit();
            else open.delete(position);
          });
        };
        editor.on('transaction', changed);
        renumber();
        return {
          dom,
          update(next) {
            if (next.type !== current.type) return false;
            const replaced = next.attrs.text !== current.attrs.text;
            current = next;
            // New text (undo, redo or this field's own commit) replaces what an open field
            // holds, so leaving it later stores nothing stale.
            if (replaced && editing) reset();
            render();
            return true;
          },
          selectNode: () => dom.classList.add('ProseMirror-selectednode'),
          deselectNode: () => dom.classList.remove('ProseMirror-selectednode'),
          stopEvent: (event) => panel.contains(event.target as Element),
          ignoreMutation: () => true,
          destroy: () => {
            open.delete(position);
            editor.off('transaction', changed);
          },
        };
      };
    },
  });
