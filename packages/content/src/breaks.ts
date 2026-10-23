// Structure that is not content: the document node, the "more" teaser break, page breaks and
// synced pattern references. Breaks may only sit at the top level of a document.
import { Node } from '@tiptap/core';

/** `block` everywhere; `break` nodes only between top-level blocks. */
export const DocumentNode = Node.create({
  name: 'doc',
  topNode: true,
  content: '(block | break)+',
});

/** WordPress `<!--more-->`: what comes before it is the entry's teaser in lists. */
export const More = Node.create({
  name: 'more',
  group: 'break',
  atom: true,
  selectable: true,
  parseHTML: () => [{ tag: 'div[data-cms-more]' }],
  renderHTML: () => ['div', { class: 'cms-more', 'data-cms-more': 'true' }],
});

/** WordPress `<!--nextpage-->`: the single entry is shown in pages split here. */
export const PageBreak = Node.create({
  name: 'pageBreak',
  group: 'break',
  atom: true,
  selectable: true,
  parseHTML: () => [{ tag: 'div[data-cms-nextpage]' }],
  renderHTML: () => [
    'div',
    { class: 'cms-nextpage', 'data-cms-nextpage': 'true' },
  ],
});

/**
 * A synced pattern (WordPress reusable block) by id. Stored and rendered as an empty marked
 * element; the API puts the pattern's current published body there when it serves the content.
 */
export const PatternRef = Node.create({
  name: 'patternRef',
  group: 'block',
  atom: true,
  selectable: true,
  addAttributes: () => ({
    ref: {
      default: null,
      parseHTML: (element) => element.getAttribute('data-cms-pattern'),
      renderHTML: () => ({}),
    },
  }),
  parseHTML: () => [{ tag: 'div[data-cms-pattern]' }],
  renderHTML: ({ node }) => [
    'div',
    { class: 'cms-pattern', 'data-cms-pattern': String(node.attrs.ref ?? '') },
  ],
});

/** The exact markup of a stored page break, for splitting served HTML into pages. */
export const PAGE_BREAK_HTML =
  '<div class="cms-nextpage" data-cms-nextpage="true"></div>';
/** Stored pattern references; the id is captured. */
export const PATTERN_REF_HTML =
  /<div class="cms-pattern" data-cms-pattern="([A-Za-z0-9-]{1,36})"><\/div>/g;
