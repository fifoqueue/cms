import { Extension, Node } from '@tiptap/core';
import type { Extensions, JSONContent } from '@tiptap/core';
import type { Node as ProseNode } from '@tiptap/pm/model';
import { renderToHTMLString } from '@tiptap/static-renderer/pm/html-string';
import { collectFootnotes } from '@cms/sdk/footnotes';
import type { FootnoteGroup, FootnoteSource } from '@cms/sdk/footnotes';
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
        if (/^(?:comment-|moderate-|fn-)/.test(base)) base = `heading-${base}`;
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

interface FootnotePage {
  groups: FootnoteGroup[];
  /** Each reference's 1-based group number and 0-based place among the group's references. */
  references: { number: number; order: number }[];
}

/**
 * Notes per page, as each page lists its own: names group references within a page, and a
 * named note always shows its name's first nonblank text in the whole document.
 */
function footnotePages(document: ProseNode): FootnotePage[] {
  const pages: FootnoteSource[][] = [[]];
  const definitions = new Map<string, string>();
  document.descendants((node) => {
    if (node.type.name === 'pageBreak') pages.push([]);
    if (node.type.name !== 'footnote') return;
    const name = String(node.attrs.name ?? '');
    const text = String(node.attrs.text ?? '');
    if (name && text && !definitions.has(name)) definitions.set(name, text);
    pages.at(-1)!.push({ name, text });
  });
  return pages.map((sources) => {
    const groups = collectFootnotes(sources);
    const references: FootnotePage['references'] = [];
    groups.forEach((group, offset) => {
      const name = sources[group.references[0]!]!.name;
      if (name) group.text = definitions.get(name) ?? '';
      group.references.forEach((source, order) => {
        references[source] = { number: offset + 1, order };
      });
    });
    return { groups, references };
  });
}

/** Numeric, never the raw name; a reused note numbers each of its references. */
const referenceId = (
  page: number,
  number: number,
  group: FootnoteGroup,
  order: number,
) =>
  group.references.length === 1
    ? `fn-ref-${page}-${number}`
    : `fn-ref-${page}-${number}-${order + 1}`;

export type TocRenderOptions = NonNullable<
  Parameters<typeof renderToHTMLString>[0]['options']
>;

export interface AutoTocOptions {
  enabled: boolean;
  override?: 'default' | 'always' | 'never';
  position?: 'before-heading' | 'top';
  attrs?: Partial<TocAttrs>;
}

/**
 * Render before pagination. Additional mappings (e.g. syntax-highlighted code blocks)
 * and marks are preserved; TOC, heading and page-break mappings belong to this module.
 */
export function renderWithToc(
  document: ProseNode,
  extensions: Extensions,
  options: TocRenderOptions = {},
  autoToc?: AutoTocOptions,
): string {
  const headings = collectHeadings(document);
  const byPosition = new Map(
    headings.map((heading) => [heading.position, heading]),
  );
  const positions: number[] = [];
  let manualToc = false;
  document.descendants((node, position) => {
    if (node.type.name === 'heading') positions.push(position);
    if (node.type.name === 'tableOfContents') manualToc = true;
  });
  const automatic =
    !manualToc &&
    autoToc?.override !== 'never' &&
    (autoToc?.override === 'always' || autoToc?.enabled);
  const attrs = { ...tocDefaults, minHeadings: 3, ...autoToc?.attrs };
  const inserted = new Set<number>();
  const insert = (page: number) => {
    if (!automatic || inserted.has(page)) return '';
    inserted.add(page);
    return tocHTML(headings, attrs, page);
  };
  let index = 0;
  let page = 1;
  const notes = footnotePages(document);
  let reference = 0;
  const back = (id: string, label: string, text: string) =>
    `<a data-footnote-back data-footnote-label="${escape(label)}" href="#${id}" aria-label="Back to reference ${escape(label)}">${escape(text)}</a>`;
  const footnotes = () => {
    const { groups } = notes[page - 1]!;
    if (!groups.length) return '';
    return `<section class="cms-footnotes"><ol>${groups
      .map((group, offset) => {
        const number = offset + 1;
        const label = escape(group.label);
        const backs =
          group.references.length === 1
            ? back(
                referenceId(page, number, group, 0),
                group.label,
                `[${group.label}]`,
              )
            : `<span data-footnote-group>[${label}]</span> ${group.references
                .map((_, order) => {
                  const text = `${number}.${order + 1}`;
                  return back(
                    referenceId(page, number, group, order),
                    text,
                    text,
                  );
                })
                .join(' ')}`;
        return `<li id="fn-${page}-${number}" data-footnote-label="${label}"><span>${escape(group.text)}</span> ${backs}</li>`;
      })
      .join('')}</ol></section>`;
  };
  const prefix = autoToc?.position === 'top' ? insert(1) : '';
  return (
    prefix +
    renderToHTMLString({
      extensions,
      content: document,
      options: {
        ...options,
        nodeMapping: {
          ...options.nodeMapping,
          footnote: () => {
            const { groups, references } = notes[page - 1]!;
            const { number, order } = references[reference++]!;
            const group = groups[number - 1]!;
            const label = escape(group.label);
            return `<sup id="${referenceId(page, number, group, order)}"><a data-footnote-ref data-footnote-label="${label}" href="#fn-${page}-${number}" aria-label="Footnote ${label}">${label}</a></sup>`;
          },
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
            return `${insert(page)}<h${level}${heading ? ` id="${escape(heading.id)}"` : ''}${align}>${content}</h${level}>`;
          },
          tableOfContents: ({ node }) =>
            tocHTML(headings, { ...tocDefaults, ...node.attrs }, page),
          pageBreak: () => {
            const list = footnotes();
            page++;
            reference = 0;
            return (
              list +
              PAGE_BREAK_HTML +
              (autoToc?.position === 'top' ? insert(page) : '')
            );
          },
        },
      },
    }) +
    footnotes()
  );
}
