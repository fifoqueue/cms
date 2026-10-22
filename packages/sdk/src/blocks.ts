/**
 * Theme blocks, modelled on WordPress block themes: templates and template parts are trees of
 * blocks the core knows how to render (site title, navigation, query loop, post content, …).
 * A block is data — a name, attributes and children — never markup or code. Every attribute is
 * declared here with its type and default, so validation, the public renderer and the site
 * editor share one definition. Pure and browser-safe.
 */
import { Errors } from '#sdk/errors';

export type BlockAttr =
  | { type: 'text'; max: number; default: string; pattern?: RegExp }
  | { type: 'number'; min: number; max: number; default: number }
  | { type: 'boolean'; default: boolean }
  | { type: 'enum'; options: readonly string[]; default: string }
  /** A palette slug of the theme, or `''` for none. */
  | { type: 'color'; default: string };

export interface BlockSpec {
  attrs: Record<string, BlockAttr>;
  /** Blocks it may contain: any block, only the listed ones, or none (omitted). */
  children?: 'any' | readonly string[];
  /** Blocks it must sit directly inside. */
  parent?: readonly string[];
}

const SPACE = ['none', 'small', 'medium', 'large'] as const;
const ALIGN = ['left', 'center', 'right'] as const;
const choice = <const O extends readonly string[]>(
  options: O,
  value: O[number],
) => ({ type: 'enum' as const, options, default: value });
const space = (value: (typeof SPACE)[number]) => choice(SPACE, value);
const flag = (value: boolean) => ({ type: 'boolean' as const, default: value });
const level = (value: number, min = 1) => ({
  type: 'number' as const,
  min,
  max: 6,
  default: value,
});
const color = { type: 'color' as const, default: '' };

export const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const BLOCKS = {
  group: {
    attrs: {
      tagName: choice(
        ['div', 'header', 'main', 'footer', 'section', 'aside', 'nav'],
        'div',
      ),
      /** constrained: centred at `width`; flex: a row; grid: equal columns; stack: a column. */
      layout: choice(['constrained', 'flex', 'grid', 'stack'], 'constrained'),
      width: choice(['content', 'wide', 'full'], 'wide'),
      justify: choice(['start', 'center', 'end', 'between'], 'start'),
      align: choice(['start', 'center', 'end', 'stretch'], 'center'),
      wrap: flag(true),
      columns: { type: 'number', min: 1, max: 6, default: 3 },
      gap: space('medium'),
      padding: space('none'),
      background: color,
      textColor: color,
      border: choice(['none', 'top', 'bottom', 'both', 'box'], 'none'),
      sticky: flag(false),
      /** A hook for the theme's style.css. */
      className: { type: 'text', max: 64, default: '', pattern: SLUG },
    },
    children: 'any',
  },
  columns: {
    attrs: { gap: space('large'), stackOnMobile: flag(true) },
    children: ['column'],
  },
  column: {
    attrs: {
      /** Percent of the row; 0 shares the remaining space. */
      width: { type: 'number', min: 0, max: 100, default: 0 },
    },
    children: 'any',
    parent: ['columns'],
  },
  'template-part': {
    attrs: { slug: { type: 'text', max: 64, default: '', pattern: SLUG } },
  },
  'site-title': {
    attrs: {
      /** 0 renders a paragraph instead of a heading. */
      level: level(0, 0),
      link: flag(true),
      size: choice(['small', 'medium', 'large'], 'medium'),
    },
  },
  'site-tagline': { attrs: {} },
  navigation: {
    attrs: {
      location: choice(['primary', 'footer'], 'primary'),
      orientation: choice(['horizontal', 'vertical'], 'horizontal'),
      /** Collapse into a menu button on small screens. */
      overlay: flag(true),
    },
  },
  search: { attrs: { showLabel: flag(false) } },
  'widget-area': {
    attrs: {
      area: choice(['sidebar', 'footer'], 'sidebar'),
      layout: choice(['stack', 'columns'], 'stack'),
    },
  },
  'post-title': {
    attrs: {
      level: level(2),
      link: flag(false),
      size: choice(['small', 'medium', 'large', 'xlarge'], 'large'),
    },
  },
  'post-meta': {
    attrs: {
      showDate: flag(true),
      showAuthor: flag(true),
      showComments: flag(true),
      showUpdated: flag(false),
      showSticky: flag(true),
    },
  },
  'post-content': { attrs: {} },
  'post-excerpt': { attrs: { moreLink: flag(false) } },
  'post-featured-image': {
    attrs: {
      link: flag(true),
      aspect: choice(['auto', 'wide', 'standard', 'square'], 'auto'),
      rounded: flag(true),
    },
  },
  'post-terms': {
    attrs: {
      taxonomy: { type: 'text', max: 32, default: 'category', pattern: SLUG },
    },
  },
  'post-fields': { attrs: {} },
  comments: { attrs: {} },
  breadcrumbs: { attrs: {} },
  query: {
    attrs: {
      inherit: flag(true),
      type: { type: 'text', max: 32, default: '', pattern: SLUG },
      category: { type: 'text', max: 191, default: '', pattern: SLUG },
      tag: { type: 'text', max: 191, default: '', pattern: SLUG },
      author: { type: 'text', max: 191, default: '', pattern: SLUG },
      count: { type: 'number', min: 1, max: 100, default: 6 },
      layout: choice(['list', 'grid'], 'list'),
      columns: { type: 'number', min: 1, max: 4, default: 3 },
      gap: space('large'),
      divider: flag(false),
    },
    children: 'any',
  },
  'post-template': { attrs: {}, children: 'any', parent: ['query'] },
  'query-no-results': { attrs: {}, children: 'any', parent: ['query'] },
  'query-pagination': { attrs: {}, parent: ['query'] },
  'query-title': {
    attrs: {
      level: level(1),
      showDescription: flag(true),
      showCount: flag(true),
    },
  },
  'content-type-nav': { attrs: {} },
  heading: {
    attrs: {
      text: { type: 'text', max: 200, default: '' },
      level: level(2),
      align: choice(ALIGN, 'left'),
    },
  },
  paragraph: {
    attrs: {
      text: { type: 'text', max: 2000, default: '' },
      align: choice(ALIGN, 'left'),
      size: choice(['small', 'medium', 'large'], 'medium'),
      muted: flag(false),
    },
  },
  separator: { attrs: {} },
  spacer: { attrs: { size: space('medium') } },
  copyright: { attrs: {} },
} as const satisfies Record<string, BlockSpec>;

export type BlockName = keyof typeof BLOCKS;
export const BLOCK_NAMES = Object.keys(BLOCKS) as BlockName[];

type AttrValue<A> = A extends { type: 'number' }
  ? number
  : A extends { type: 'boolean' }
    ? boolean
    : A extends { type: 'enum'; options: readonly (infer O)[] }
      ? O
      : string;

export type BlockAttrs<N extends BlockName> = {
  [K in keyof (typeof BLOCKS)[N]['attrs']]: AttrValue<
    (typeof BLOCKS)[N]['attrs'][K]
  >;
};

/** A validated block: every declared attribute is present (defaults applied). */
export type Block = {
  [N in BlockName]: { name: N; attrs: BlockAttrs<N>; children: Block[] };
}[BlockName];

/** What a theme author writes: attributes and children may be left out. */
export interface BlockInput {
  name: string;
  attrs?: Record<string, unknown>;
  children?: BlockInput[];
}

/** Hard limits that keep a template cheap to validate and render. */
export const BLOCK_LIMITS = { depth: 16, nodes: 1000 } as const;

/** WordPress template hierarchy names, optionally narrowed by a slug or type (`single-article`). */
export const TEMPLATE_NAME =
  /^(index|home|front-page|singular|single|page|archive|taxonomy|category|tag|author|date|search|404)(-[a-z0-9]+(?:-[a-z0-9]+)*)?$/;

export interface BlockIssue {
  path: string;
  message: string;
}

const attrIssue = (spec: BlockAttr, value: unknown): string | null => {
  switch (spec.type) {
    case 'text':
      return typeof value !== 'string'
        ? Errors.BlockAttrText
        : value.length > spec.max
          ? Errors.BlockAttrTooLong(spec.max)
          : spec.pattern && value !== '' && !spec.pattern.test(value)
            ? Errors.BlockAttrFormat
            : null;
    case 'color':
      return typeof value === 'string' && (value === '' || SLUG.test(value))
        ? null
        : Errors.BlockAttrColor;
    case 'number':
      return typeof value === 'number' &&
        Number.isInteger(value) &&
        value >= spec.min &&
        value <= spec.max
        ? null
        : Errors.BlockAttrNumber(spec.min, spec.max);
    case 'boolean':
      return typeof value === 'boolean' ? null : Errors.BlockAttrBoolean;
    case 'enum':
      return spec.options.includes(value as string)
        ? null
        : Errors.BlockAttrChoice(spec.options.join(', '));
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Validates a block list and applies attribute defaults. Unknown blocks, unknown attributes,
 * misplaced blocks and trees beyond `BLOCK_LIMITS` are reported rather than dropped, so a theme
 * author sees every mistake at once.
 */
export const parseBlocks = (
  input: unknown,
): { blocks: Block[]; issues: BlockIssue[] } => {
  const issues: BlockIssue[] = [];
  let nodes = 0;

  const list = (
    value: unknown,
    path: string,
    depth: number,
    parent: string | null,
  ): Block[] => {
    if (!Array.isArray(value)) {
      issues.push({ path, message: Errors.BlocksNotList });
      return [];
    }
    if (depth > BLOCK_LIMITS.depth) {
      issues.push({ path, message: Errors.BlocksTooDeep });
      return [];
    }
    const blocks: Block[] = [];
    value.forEach((entry, index) => {
      const at = `${path}[${index}]`;
      if (++nodes > BLOCK_LIMITS.nodes) {
        if (nodes === BLOCK_LIMITS.nodes + 1)
          issues.push({ path: at, message: Errors.BlocksTooMany });
        return;
      }
      if (!isRecord(entry)) {
        issues.push({ path: at, message: Errors.BlockInvalid });
        return;
      }
      for (const key of Object.keys(entry))
        if (key !== 'name' && key !== 'attrs' && key !== 'children')
          issues.push({
            path: `${at}.${key}`,
            message: Errors.BlockPropertyUnknown,
          });
      const name = entry.name;
      if (typeof name !== 'string' || !Object.hasOwn(BLOCKS, name)) {
        issues.push({ path: `${at}.name`, message: Errors.BlockUnknown });
        return;
      }
      const spec: BlockSpec = BLOCKS[name as BlockName];
      if (spec.parent && (!parent || !spec.parent.includes(parent)))
        issues.push({
          path: at,
          message: Errors.BlockParent(spec.parent.join(' or ')),
        });
      if (parent) {
        const allowed = (BLOCKS[parent as BlockName] as BlockSpec).children;
        if (Array.isArray(allowed) && !allowed.includes(name))
          issues.push({
            path: at,
            message: Errors.BlockNotAllowedInside(parent),
          });
      }
      const attrs: Record<string, unknown> = {};
      const given = entry.attrs ?? {};
      if (!isRecord(given))
        issues.push({ path: `${at}.attrs`, message: Errors.BlockAttrsInvalid });
      else
        for (const key of Object.keys(given))
          if (!Object.hasOwn(spec.attrs, key))
            issues.push({
              path: `${at}.attrs.${key}`,
              message: Errors.BlockAttrUnknown,
            });
      for (const [key, attr] of Object.entries(spec.attrs)) {
        const value =
          isRecord(given) && given[key] !== undefined
            ? given[key]
            : attr.default;
        const problem = attrIssue(attr, value);
        if (problem)
          issues.push({ path: `${at}.attrs.${key}`, message: problem });
        attrs[key] = value;
      }
      if (name === 'template-part' && !attrs.slug)
        issues.push({
          path: `${at}.attrs.slug`,
          message: Errors.BlockAttrRequired,
        });
      let children: Block[] = [];
      if (entry.children !== undefined) {
        if (!spec.children) {
          if (!Array.isArray(entry.children) || entry.children.length)
            issues.push({
              path: `${at}.children`,
              message: Errors.BlockNoChildren,
            });
        } else
          children = list(entry.children, `${at}.children`, depth + 1, name);
      }
      blocks.push({ name, attrs, children } as Block);
    });
    return blocks;
  };

  const blocks = list(input, '', 0, null);
  return { blocks, issues };
};

/** Every block in a tree, depth first. */
export function* walkBlocks(blocks: readonly Block[]): Generator<Block> {
  for (const block of blocks) {
    yield block;
    yield* walkBlocks(block.children);
  }
}
