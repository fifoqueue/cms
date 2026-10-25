import { Node } from '@tiptap/core';

/** Each inline atom owns one plain-text note; numbers are derived, never stored. */
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
    };
  },
  parseHTML() {
    return [{ tag: 'sup[data-footnote]' }];
  },
  renderHTML({ node }) {
    return ['sup', { 'data-footnote': node.attrs.text }, '*'];
  },
  renderText() {
    return '';
  },
});
