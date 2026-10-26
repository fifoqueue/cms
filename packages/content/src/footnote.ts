import { InputRule, Node, PasteRule } from '@tiptap/core';
import { isFootnoteName, parseFootnote } from '@cms/sdk/footnotes';

// Candidates only; `parseFootnote` decides what a shortcut means.
const typedPattern = /\[\*[^[\]\n]+\]$/u;
const pastedPattern = /\[\*[^[\]\n]+\]/gu;

/**
 * Each inline atom owns one plain-text note; numbers are derived, never stored. A `name`
 * (`''` = anonymous) groups references: a named one with blank text reuses the first
 * nonblank text of the same name. Typing or pasting `[* text]`, `[*name text]` or `[*name]`
 * inserts one.
 */
export const Footnote = Node.create({
  name: 'footnote',
  group: 'inline',
  inline: true,
  atom: true,
  marks: '',
  addAttributes() {
    return {
      text: {
        default: '',
        parseHTML: (element: HTMLElement) =>
          element.getAttribute('data-footnote') ?? '',
        rendered: false,
      },
      name: {
        default: '',
        parseHTML: (element: HTMLElement) => {
          const name = element.getAttribute('data-footnote-name') ?? '';
          return isFootnoteName(name) ? name : '';
        },
        rendered: false,
      },
    };
  },
  parseHTML() {
    return [{ tag: 'sup[data-footnote]' }];
  },
  renderHTML({ node }) {
    const name = String(node.attrs.name ?? '');
    return [
      'sup',
      {
        'data-footnote': node.attrs.text,
        ...(name ? { 'data-footnote-name': name } : {}),
      },
      '*',
    ];
  },
  addInputRules() {
    return [
      new InputRule({
        find: (text) => {
          const match = typedPattern.exec(text);
          const data = match && parseFootnote(match[0]);
          return match && data
            ? { index: match.index, text: match[0], data }
            : null;
        },
        handler: ({ state, range, match }) => {
          state.tr.replaceWith(
            range.from,
            range.to,
            this.type.create(match.data),
          );
        },
      }),
    ];
  },
  addPasteRules() {
    return [
      new PasteRule({
        find: (text) =>
          [...text.matchAll(pastedPattern)].flatMap((match) => {
            const data = parseFootnote(match[0]);
            return data ? [{ index: match.index, text: match[0], data }] : [];
          }),
        handler: ({ state, range, match }) => {
          state.tr.replaceWith(
            range.from,
            range.to,
            this.type.create(match.data),
          );
        },
      }),
    ];
  },
  renderText() {
    return '';
  },
});
