import { Extension, Node } from '@tiptap/core';
import type { Extensions, JSONContent } from '@tiptap/core';
import type { Node as ProseNode } from '@tiptap/pm/model';
import { renderToHTMLString } from '@tiptap/static-renderer/pm/html-string';
import { PAGE_BREAK_HTML } from '#content/breaks';

export const headingAnchorPattern = /^[\p{L}][\p{L}\p{N}\p{M}_:.-]{0,99}$/u;
/** Every heading level a document may use; the editor schema and TOC options share it. */
export const HEADING_LEVELS = [1, 2, 3, 4, 5, 6] as const;
const isHeadingLevel = (value: unknown): value is number =>
  (HEADING_LEVELS as readonly unknown[]).includes(value);
export const headingLevel = (value: unknown) =>
  isHeadingLevel(Number(value)) ? Number(value) : 2;
export const HeadingAnchor = Extension.create({
  name: 'headingAnchor',
  addGlobalAttributes: () => [
    {
      types: ['heading'],
      attributes: {
        anchor: {
          default: null,
          parseHTML: (element) => {
            const id = element.getAttribute('id');
            return id && headingAnchorPattern.test(id) ? id : null;
          },
          renderHTML: (attrs) =>
            attrs.anchor && headingAnchorPattern.test(attrs.anchor)
              ? { id: attrs.anchor }
              : {},
        },
      },
    },
  ],
});

/** Call during validation, before schema construction or rendering. */
export function validTocCount(document: JSONContent): boolean {
  let count = 0;
  const stack = [document];
  while (stack.length) {
    const node = stack.pop()!;
    if (node.type === 'tableOfContents' && ++count > 3) return false;
    if (node.content) stack.push(...node.content);
  }
  return true;
}

export interface TocAttrs {
  title: string;
  levels: number[];
  minHeadings: number;
  excluded: string[];
  collapsible: boolean;
  open: boolean;
}
export const tocDefaults: TocAttrs = {
  title: '',
  levels: [2, 3, 4],
  minHeadings: 0,
  excluded: [],
  collapsible: true,
  open: true,
};
export interface TocHeading {
  id: string;
  text: string;
  level: number;
  page: number;
  children: TocHeading[];
  position?: number;
}

const headingCache = new WeakMap<ProseNode, TocHeading[]>();
/** IDs are document-wide; outlines are page-local, so every link works after pagination. */
export function collectHeadings(
  document: JSONContent | ProseNode,
): TocHeading[] {
  if ('descendants' in document && typeof document.descendants === 'function') {
    const doc = document as ProseNode;
    const cached = headingCache.get(doc);
    if (cached) return cached;
    const entries: JSONContent[] = [];
    const positions: number[] = [];
    // Synced patterns are expanded later by the API; their headings are not part of this outline.
    doc.descendants((node, position) => {
      if (node.type.name === 'heading') {
        entries.push({
          type: 'heading',
          attrs: node.attrs,
          content: [
            {
              type: 'text',
              text: node.textBetween(0, node.content.size, '', ' '),
            },
          ],
        });
        if (node.textContent.trim()) positions.push(position);
        return false;
      }
      if (node.type.name === 'pageBreak') entries.push({ type: 'pageBreak' });
    });
    const result = collectHeadings({ type: 'doc', content: entries });
    result.forEach((heading, index) => {
      heading.position = positions[index];
    });
    headingCache.set(doc, result);
    return result;
  }
  const headings: TocHeading[] = [];
  const used = new Set<string>();
  let page = 1;
  const textOf = (node: JSONContent): string =>
    node.text ??
    (node.type === 'hardBreak'
      ? ' '
      : (node.content ?? []).map(textOf).join(''));
  const visit = (node: JSONContent) => {
    if (node.type === 'pageBreak') page++;
    if (node.type === 'heading') {
      const text = textOf(node).trim();
      if (text) {
        const generated =
          text
            .normalize('NFC')
            .toLowerCase()
            .replace(/[^\p{L}\p{N}\p{M}\s-]/gu, '')
            .trim()
            .replace(/[\s-]+/g, '-') || 'heading';
        const anchor = node.attrs?.anchor;
        let base =
          typeof anchor === 'string' && headingAnchorPattern.test(anchor)
            ? anchor
            : generated.slice(0, 180);
        if (
          /^(?:comments|main|comment-moderation|content-password)$/.test(base)
        )
          base += '-heading';
        if (/^(?:comment-|moderate-)/.test(base)) base = `heading-${base}`;
        let id = base;
        for (let suffix = 2; used.has(id); suffix++) id = `${base}-${suffix}`;
        used.add(id);
        headings.push({
          id,
          text,
          level: headingLevel(node.attrs?.level),
          page,
          children: [],
        });
      }
    }
    node.content?.forEach(visit);
  };
  visit(document as JSONContent);
  return headings;
}

/** The editor uses absolute ProseMirror positions; only top-level breaks split pages. */
export function tocPage(document: ProseNode, position: number): number {
  let page = 1;
  document.forEach((node, offset) => {
    if (offset < position && node.type.name === 'pageBreak') page++;
  });
  return page;
}

export function tocOutline(
  headings: TocHeading[],
  attrs: TocAttrs,
  page: number,
): TocHeading[] {
  const selected = headings.filter(
    (h) =>
      h.page === page &&
      attrs.levels.includes(h.level) &&
      !attrs.excluded.includes(h.id),
  );
  if (selected.length < attrs.minHeadings) return [];
  const roots: TocHeading[] = [];
  const stack: TocHeading[] = [];
  for (const heading of selected) {
    const item: TocHeading = { ...heading, children: [] };
    while (stack.length && stack[stack.length - 1]!.level >= item.level)
      stack.pop();
    (stack.at(-1)?.children ?? roots).push(item);
    stack.push(item);
  }
  return roots;
}

const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        char
      ]!,
  );

export function parseTocAttrs(element: HTMLElement): TocAttrs {
  let raw: Partial<TocAttrs>;
  try {
    raw = JSON.parse(element.getAttribute('data-toc') ?? '{}') ?? {};
  } catch {
    return { ...tocDefaults };
  }
  return {
    title:
      typeof raw.title === 'string' && raw.title.length <= 200 ? raw.title : '',
    levels:
      Array.isArray(raw.levels) &&
      raw.levels.length <= HEADING_LEVELS.length &&
      raw.levels.every(isHeadingLevel)
        ? [...new Set(raw.levels)]
        : [...tocDefaults.levels],
    minHeadings:
      Number.isInteger(raw.minHeadings) &&
      raw.minHeadings! >= 0 &&
      raw.minHeadings! <= 100
        ? raw.minHeadings!
        : 0,
    excluded:
      Array.isArray(raw.excluded) &&
      raw.excluded.length <= 100 &&
      raw.excluded.every((id) => typeof id === 'string' && id.length <= 200)
        ? raw.excluded
        : [],
    collapsible: typeof raw.collapsible === 'boolean' ? raw.collapsible : true,
    open: typeof raw.open === 'boolean' ? raw.open : true,
  };
}

export function tocHTML(
  headings: TocHeading[],
  attrs: TocAttrs,
  page: number,
): string {
  const outline = tocOutline(headings, attrs, page);
  if (!outline.length) return '';
  const list = (items: TocHeading[]): string =>
    `<ol>${items
      .map(
        (h) =>
          `<li><a href="#${escape(h.id)}">${escape(h.text)}</a>${h.children.length ? list(h.children) : ''}</li>`,
      )
      .join('')}</ol>`;
  // Localized defaults are stored by the inserter, not inferred from visitor language.
  const title = escape(attrs.title || 'Contents');
  const body = attrs.collapsible
    ? `<details${attrs.open ? ' open' : ''}><summary>${title}</summary>${list(outline)}</details>`
    : `<div class="cms-toc-title">${title}</div>${list(outline)}`;
  return `<nav class="cms-toc" data-toc="${escape(JSON.stringify(attrs))}" aria-label="${title}">${body}</nav>`;
}

export const TableOfContents = Node.create({
  name: 'tableOfContents',
  group: 'block',
  atom: true,
  addAttributes: () =>
    Object.fromEntries(
      Object.entries(tocDefaults).map(([key, value]) => [
        key,
        { default: value, rendered: false },
      ]),
    ),
  parseHTML: () => [{ tag: 'nav.cms-toc', getAttrs: parseTocAttrs }],
  renderHTML: ({ node }) => [
    'nav',
    { class: 'cms-toc', 'data-toc': JSON.stringify(node.attrs) },
  ],
});

export type TocRenderOptions = NonNullable<
  Parameters<typeof renderToHTMLString>[0]['options']
>;

/**
 * Render before pagination. Additional mappings (e.g. syntax-highlighted code blocks)
 * and marks are preserved; TOC, heading and page-break mappings belong to this module.
 */
export function renderWithToc(
  document: ProseNode,
  extensions: Extensions,
  options: TocRenderOptions = {},
): string {
  const headings = collectHeadings(document);
  const byPosition = new Map(
    headings.map((heading) => [heading.position, heading]),
  );
  const positions: number[] = [];
  document.descendants((node, position) => {
    if (node.type.name === 'heading') positions.push(position);
  });
  let index = 0;
  let page = 1;
  return renderToHTMLString({
    extensions,
    content: document,
    options: {
      ...options,
      nodeMapping: {
        ...options.nodeMapping,
        heading: ({ node, children }) => {
          const heading = byPosition.get(positions[index++]);
          const level = headingLevel(node.attrs.level);
          const align = ['left', 'center', 'right', 'justify'].includes(
            node.attrs.textAlign,
          )
            ? ` class="cms-text-${node.attrs.textAlign}"`
            : '';
          const content = Array.isArray(children)
            ? children.join('')
            : (children ?? '');
          return `<h${level}${heading ? ` id="${escape(heading.id)}"` : ''}${align}>${content}</h${level}>`;
        },
        tableOfContents: ({ node }) =>
          tocHTML(headings, { ...tocDefaults, ...node.attrs }, page),
        pageBreak: () => {
          page++;
          return PAGE_BREAK_HTML;
        },
      },
    },
  });
}
