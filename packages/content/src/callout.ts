import { Node } from '@tiptap/core';
import type { DOMOutputSpec, Node as ProseMirrorNode } from '@tiptap/pm/model';
import { CALLOUT_VARIANTS } from '@cms/sdk';

/** A known variant, else `info`: imported or stale names never reach the stored document. */
const variantOf = (value: unknown) =>
  typeof value === 'string' &&
  (CALLOUT_VARIANTS as readonly string[]).includes(value)
    ? value
    : 'info';

const classes = (node: ProseMirrorNode) =>
  `cms-callout cms-callout-${variantOf(node.attrs.variant)}`;

/** The icon and close button are decoration, never content. */
const DECORATION = ':scope > :is(.cms-callout-icon, .cms-callout-close)';

/**
 * A callout (alert) box: an icon and tint per variant around rich text. A dismissible one
 * renders its close button `hidden`; the public theme reveals and labels it, so without
 * scripts the callout simply stays.
 */
export const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'block+',
  defining: true,
  addAttributes: () => ({
    variant: {
      default: 'info',
      parseHTML: (element) =>
        variantOf(
          [...element.classList]
            .find((name) => name.startsWith('cms-callout-'))
            ?.slice('cms-callout-'.length),
        ),
    },
    dismissible: {
      default: false,
      parseHTML: (element) =>
        element.getAttribute('data-dismissible') === 'true',
    },
  }),
  parseHTML: () => [
    {
      tag: 'aside.cms-callout',
      contentElement: (dom) => {
        const element = dom as HTMLElement;
        const body = element.querySelector<HTMLElement>(
          ':scope > .cms-callout-body',
        );
        if (body) return body;
        for (const part of element.querySelectorAll(DECORATION)) part.remove();
        return element;
      },
    },
  ],
  renderHTML: ({ node }) => [
    'aside',
    {
      class: classes(node),
      role: 'note',
      ...(node.attrs.dismissible && { 'data-dismissible': 'true' }),
    },
    ['span', { class: 'cms-callout-icon', 'aria-hidden': 'true' }],
    ['div', { class: 'cms-callout-body' }, 0],
    ...(node.attrs.dismissible
      ? [
          [
            'button',
            { type: 'button', class: 'cms-callout-close', hidden: '' },
            ['span', { 'aria-hidden': 'true' }, '×'],
          ] as DOMOutputSpec,
        ]
      : []),
  ],
  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement('aside');
      const icon = document.createElement('span');
      const contentDOM = document.createElement('div');
      const close = document.createElement('span');
      dom.setAttribute('role', 'note');
      icon.className = 'cms-callout-icon';
      contentDOM.className = 'cms-callout-body';
      // A visual cue only: dismissal works on the public page.
      close.className = 'cms-callout-close';
      close.textContent = '×';
      for (const part of [icon, close]) {
        part.contentEditable = 'false';
        part.setAttribute('aria-hidden', 'true');
      }
      const paint = (current: ProseMirrorNode) => {
        dom.className = classes(current);
        close.hidden = current.attrs.dismissible !== true;
      };
      paint(node);
      dom.append(icon, contentDOM, close);
      return {
        dom,
        contentDOM,
        update: (next) => {
          if (next.type !== node.type) return false;
          paint(next);
          return true;
        },
      };
    };
  },
});
