import { Extension, Node } from '@tiptap/core';
import { Table } from '@tiptap/extension-table';
import { DOMParser, Fragment } from '@tiptap/pm/model';
import type { DOMOutputSpec, Schema } from '@tiptap/pm/model';
import { safeLinkHref } from '#content/urls';

export const TextAlignment = Extension.create({
  name: 'textAlignment',
  addGlobalAttributes() {
    return [
      {
        types: ['paragraph', 'heading'],
        attributes: {
          textAlign: {
            default: null,
            parseHTML: (element) =>
              element.style.textAlign ||
              /(?:has-text-align-|cms-text-)(left|center|right|justify)/.exec(
                element.className,
              )?.[1] ||
              null,
            renderHTML: (attrs) =>
              attrs.textAlign ? { class: `cms-text-${attrs.textAlign}` } : {},
          },
        },
      },
    ];
  },
});

export const Columns = Node.create({
  name: 'columns',
  group: 'block',
  content: 'column{2,4}',
  isolating: true,
  addAttributes: () => ({
    stack: {
      default: true,
      parseHTML: (element) =>
        !element.classList.contains('is-not-stacked-on-mobile') &&
        element.getAttribute('data-stack') !== 'false',
    },
  }),
  parseHTML: () => [
    { tag: 'div.wp-block-columns', priority: 60 },
    { tag: 'div.cms-columns' },
  ],
  renderHTML: ({ node }) => [
    'div',
    {
      class: 'cms-columns',
      'data-stack': String(node.attrs.stack),
      style: `--cms-column-count:${node.childCount}`,
    },
    0,
  ],
});

export const Column = Node.create({
  name: 'column',
  content: 'block+',
  isolating: true,
  parseHTML: () => [
    { tag: 'div.wp-block-column', priority: 60 },
    { tag: 'div.cms-column' },
  ],
  renderHTML: () => ['div', { class: 'cms-column' }, 0],
});

export const Buttons = Node.create({
  name: 'buttons',
  group: 'block',
  content: 'button{1,20}',
  isolating: true,
  addAttributes: () => ({
    align: {
      default: 'left',
      parseHTML: (element) =>
        element.getAttribute('data-align') ??
        /is-content-justification-(left|center|right)/.exec(
          element.className,
        )?.[1] ??
        'left',
    },
  }),
  parseHTML: () => [
    { tag: 'div.wp-block-buttons', priority: 60 },
    { tag: 'div.cms-buttons' },
  ],
  renderHTML: ({ node }) => [
    'div',
    { class: 'cms-buttons', 'data-align': node.attrs.align },
    0,
  ],
});

export const ButtonLink = Node.create({
  name: 'button',
  content: 'text*',
  marks: '',
  defining: true,
  addAttributes() {
    return {
      href: {
        default: null,
        parseHTML: (element) =>
          safeLinkHref(
            element.getAttribute('href') ??
              element.querySelector('a')?.getAttribute('href'),
          ),
      },
      variant: {
        default: 'fill',
        parseHTML: (element) =>
          element.classList.contains('is-style-outline') ||
          element.getAttribute('data-variant') === 'outline'
            ? 'outline'
            : 'fill',
      },
      newTab: {
        default: false,
        parseHTML: (element) =>
          (element.getAttribute('target') ??
            element.querySelector('a')?.getAttribute('target')) === '_blank',
      },
    };
  },
  parseHTML: () => [
    { tag: 'div.wp-block-button', priority: 60 },
    { tag: 'a.cms-button', priority: 60 },
  ],
  renderHTML: ({ node }) => [
    'a',
    {
      class: 'cms-button',
      href: safeLinkHref(node.attrs.href),
      'data-variant': node.attrs.variant,
      ...(node.attrs.newTab && {
        target: '_blank',
        rel: 'noopener noreferrer',
      }),
    },
    0,
  ],
});

export const Details = Node.create({
  name: 'details',
  group: 'block',
  content: 'detailsSummary detailsContent',
  defining: true,
  addAttributes: () => ({
    open: {
      default: false,
      parseHTML: (element) => element.hasAttribute('open'),
    },
  }),
  parseHTML() {
    return [
      {
        tag: 'details',
        getContent(dom, schema) {
          const element = dom as HTMLElement;
          const summary = element.querySelector(':scope > summary');
          const body = element.ownerDocument.createElement('div');
          for (const child of Array.from(element.childNodes))
            if (child !== summary) body.appendChild(child.cloneNode(true));
          const content = DOMParser.fromSchema(schema).parse(body).content;
          return Fragment.fromArray([
            schema.nodes.detailsSummary!.create(
              null,
              summary?.textContent
                ? schema.text(summary.textContent)
                : undefined,
            ),
            schema.nodes.detailsContent!.create(
              null,
              content.childCount ? content : schema.nodes.paragraph!.create(),
            ),
          ]);
        },
      },
    ];
  },
  renderHTML: ({ node }) => [
    'details',
    { class: 'cms-details', ...(node.attrs.open && { open: '' }) },
    0,
  ],
  addNodeView() {
    return () => {
      const dom = document.createElement('details');
      dom.className = 'cms-details';
      dom.open = true;
      // Editing keeps the body reachable; the stored open preference affects public output only.
      dom.addEventListener('toggle', () => {
        dom.open = true;
      });
      return { dom, contentDOM: dom };
    };
  },
});

export const DetailsSummary = Node.create({
  name: 'detailsSummary',
  content: 'text*',
  marks: '',
  defining: true,
  parseHTML: () => [{ tag: 'summary' }],
  renderHTML: () => ['summary', {}, 0],
});

export const DetailsContent = Node.create({
  name: 'detailsContent',
  content: 'block+',
  defining: true,
  parseHTML: () => [{ tag: 'div.cms-details-content' }],
  renderHTML: () => ['div', { class: 'cms-details-content' }, 0],
});

export const Pullquote = Node.create({
  name: 'pullquote',
  group: 'block',
  content: 'block+',
  defining: true,
  addAttributes: () => ({
    cite: {
      default: '',
      parseHTML: (element) => element.querySelector('cite')?.textContent ?? '',
    },
  }),
  parseHTML: () =>
    ['figure.wp-block-pullquote', 'figure.cms-pullquote'].map((tag) => ({
      tag,
      priority: 60,
      getContent(dom: globalThis.Node, schema: Schema) {
        const element = dom as HTMLElement;
        const quote = element.querySelector('blockquote')?.cloneNode(true) as
          HTMLElement | undefined;
        if (!quote) return Fragment.from(schema.nodes.paragraph!.create());
        for (const cite of quote.querySelectorAll('cite')) cite.remove();
        return DOMParser.fromSchema(schema).parse(quote).content;
      },
    })),
  renderHTML: ({ node }) => [
    'figure',
    { class: 'cms-pullquote' },
    ['blockquote', {}, 0],
    ...(node.attrs.cite
      ? [['figcaption', {}, ['cite', {}, node.attrs.cite]] as DOMOutputSpec]
      : []),
  ],
});

export const Spacer = Node.create({
  name: 'spacer',
  group: 'block',
  atom: true,
  addAttributes: () => ({
    height: {
      default: 48,
      parseHTML: (element) => {
        const height =
          element.getAttribute('data-height') ??
          element.style.height.replace(/px$/, '');
        return /^\d+$/.test(height) ? Number(height) : 48;
      },
    },
  }),
  parseHTML: () => [
    { tag: 'div.wp-block-spacer', priority: 60 },
    { tag: 'div.cms-spacer' },
  ],
  renderHTML: ({ node }) => [
    'div',
    {
      class: 'cms-spacer',
      'aria-hidden': 'true',
      'data-height': node.attrs.height,
      style: `height:${node.attrs.height}px`,
    },
  ],
});

export const ContentTable = Table.extend({
  parseHTML: () => [
    { tag: 'caption', ignore: true },
    { tag: 'figure.wp-block-table', contentElement: 'table', priority: 60 },
    { tag: 'table' },
  ],
  addAttributes: () => ({
    caption: {
      default: '',
      parseHTML: (element) =>
        element.querySelector('caption')?.textContent ??
        element
          .closest('figure.wp-block-table')
          ?.querySelector(':scope > figcaption')?.textContent ??
        '',
    },
  }),
  renderHTML(props) {
    const output = this.parent!(props) as readonly unknown[];
    return props.node.attrs.caption
      ? ([
          output[0],
          output[1],
          ['caption', {}, props.node.attrs.caption],
          ...output.slice(2),
        ] as DOMOutputSpec)
      : (output as DOMOutputSpec);
  },
}).configure({ resizable: false, HTMLAttributes: { class: 'cms-table' } });
