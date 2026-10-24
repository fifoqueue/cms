import { EnhancedCodeBlock } from '@cms/content/code';
import type { Editor } from '@tiptap/core';
import type { Node } from '@tiptap/pm/model';
import { highlightedRows } from '@cms/sdk/code-block';
import {
  AUTO_THEMES,
  codeAttributes,
  codeHighlight,
} from '#lib/admin/editor/code-highlight.js';
import '#lib/theme/content/code-block.css';
import '#lib/admin/editor/editor.css';

/** One indentation step; the public block shows tabs four columns wide too. */
const INDENT = '    ';

/**
 * Indents (or outdents) the rows a selection touches, when it lies within one code block.
 * An empty selection indents by inserting at the caret. Returns false outside code blocks,
 * so Tab keeps moving focus there.
 */
const indent = (editor: Editor, outdent: boolean) => {
  const { state } = editor;
  const { $from, $to, empty } = state.selection;
  if ($from.parent.type.name !== 'codeBlock' || !$from.sameParent($to))
    return false;
  const text = $from.parent.textContent;
  const start = $from.start();
  const rows = [
    $from.parentOffset === 0
      ? 0
      : text.lastIndexOf('\n', $from.parentOffset - 1) + 1,
  ];
  for (
    let next = text.indexOf('\n', rows[0]);
    next !== -1 && next + 1 < $to.parentOffset;
    next = text.indexOf('\n', next + 1)
  )
    rows.push(next + 1);
  const tr = state.tr;
  if (!outdent && empty) tr.insertText(INDENT);
  else
    for (const row of rows.reverse()) {
      if (!outdent) {
        tr.insertText(INDENT, start + row);
        continue;
      }
      const width =
        text[row] === '\t'
          ? 1
          : /^ {0,4}/.exec(text.slice(row, row + 4))![0].length;
      if (width) tr.delete(start + row, start + row + width);
    }
  if (tr.docChanged) editor.view.dispatch(tr.scrollIntoView());
  return true;
};

/**
 * The shared code block with the public block's look while editing: a header with the label
 * (or language) and language/theme chips, syntax colors, the theme background, line numbers
 * and highlighted rows. Only the display changes; the schema and attributes stay shared.
 * Line numbers and row bands are drawn in a layer beside the text, so the editable text holds
 * nothing but its characters (Backspace and input methods act on the text alone).
 * Tab and Shift-Tab indent inside a block; Escape releases the next Tab to move focus on.
 */
export const codeBlockView = (labels: () => { name: string; auto: string }) =>
  EnhancedCodeBlock.extend<
    NonNullable<typeof EnhancedCodeBlock.options>,
    { escaped: boolean }
  >({
    addStorage() {
      return { escaped: false };
    },
    onSelectionUpdate() {
      this.storage.escaped = false;
    },
    onBlur() {
      this.storage.escaped = false;
    },
    addKeyboardShortcuts() {
      const release = () => {
        if (!this.storage.escaped) return false;
        this.storage.escaped = false;
        return true;
      };
      return {
        ...this.parent?.(),
        Tab: () => !release() && indent(this.editor, false),
        'Shift-Tab': () => !release() && indent(this.editor, true),
        Escape: () => {
          if (!this.editor.isActive(this.name)) return false;
          this.storage.escaped = true;
          return true;
        },
      };
    },
    addNodeView() {
      return ({ node }) => {
        let current = node;
        const dom = document.createElement('figure');
        dom.className = 'cms-code cms-editor-code not-prose';
        const caption = document.createElement('figcaption');
        const chips = document.createElement('span');
        chips.className = 'cms-editor-code-chips';
        chips.setAttribute('aria-hidden', 'true');
        const layer = document.createElement('div');
        layer.className = 'cms-editor-code-layer';
        layer.setAttribute('aria-hidden', 'true');
        for (const part of [caption, chips, layer])
          part.contentEditable = 'false';
        const pre = document.createElement('pre');
        const body = document.createElement('div');
        body.className = 'cms-editor-code-body';
        const code = document.createElement('code');
        code.spellcheck = false;
        code.setAttribute('autocorrect', 'off');
        code.setAttribute('autocapitalize', 'off');
        code.translate = false;
        body.append(layer, code);
        pre.append(body);
        dom.append(caption, chips, pre);
        // Rows have one fixed height (no wrapping), so numbers and bands line up by row index.
        let drawn = '';
        const drawRows = (
          next: Node,
          lineNumbers: boolean,
          first: number,
          marked: string,
        ) => {
          let rows = 1;
          const text = next.textContent;
          for (
            let at = text.indexOf('\n');
            at !== -1;
            at = text.indexOf('\n', at + 1)
          )
            rows++;
          const signature = `${rows}:${lineNumbers}:${first}:${marked}`;
          if (signature === drawn) return;
          drawn = signature;
          const isMarked = highlightedRows(marked);
          const parts: HTMLElement[] = [];
          if (marked)
            for (let row = 1; row <= rows; row++) {
              if (!isMarked(row)) continue;
              const band = document.createElement('span');
              band.className = 'cms-editor-code-mark';
              band.style.top = `${(row - 1) * 1.7}em`;
              parts.push(band);
            }
          body.classList.toggle('cms-editor-code-numbered', lineNumbers);
          if (lineNumbers) {
            const numbers = document.createElement('span');
            numbers.className = 'cms-editor-code-numbers';
            numbers.textContent = Array.from(
              { length: rows },
              (_, index) => first + index,
            ).join('\n');
            body.style.setProperty(
              '--cms-code-gutter',
              `${Math.max(3, String(first + rows - 1).length)}ch`,
            );
            parts.push(numbers);
          }
          layer.replaceChildren(...parts);
        };
        const chip = (text: string, title = text) => {
          const element = document.createElement('span');
          element.textContent = text;
          element.title = title;
          return element;
        };
        const render = (next: Node) => {
          const { attrs, language } = codeAttributes(next.attrs);
          const { name, auto } = labels();
          caption.textContent =
            attrs.label || (language === 'text' ? name : language);
          chips.replaceChildren(
            chip(language),
            attrs.theme
              ? chip(attrs.theme)
              : chip(`${AUTO_THEMES.light} · ${AUTO_THEMES.dark}`, auto),
          );
          drawRows(
            next,
            attrs.lineNumbers,
            attrs.startLine,
            attrs.highlightLines,
          );
        };
        render(node);
        return {
          dom,
          contentDOM: code,
          update(next) {
            if (next.type !== current.type) return false;
            current = next;
            render(next);
            return true;
          },
          ignoreMutation: (mutation) =>
            mutation.type !== 'selection' && !code.contains(mutation.target),
        };
      };
    },
    addProseMirrorPlugins() {
      return [...(this.parent?.() ?? []), codeHighlight()];
    },
  });
