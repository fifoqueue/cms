import { themePackageSchema } from '@cms/sdk';
import type {
  BlockInput,
  ThemePackage,
  ThemePackageInput,
  ThemePaletteColor,
} from '@cms/sdk';
import { block, part } from '#api/domain/theme/theme-blocks';

/**
 * Journal: a header with the logo, a centred primary menu, a light/dark toggle and a search
 * panel; three-column grid cards (16:9 image, date and comments, title, excerpt, category);
 * singular entries with an overlaid image header, a right sidebar, previous/next links and boxed
 * comments; a footer with the site title, description and copyright. Layout classes are
 * `className` hooks (`theme-journal-*`) styled below; without the stylesheet the templates
 * still read as a plain blog.
 */

/** A group; its `className` hook is namespaced as `journal-*` (rendered `theme-journal-*`). */
const group = (attrs: Record<string, unknown>, children: BlockInput[]) =>
  block(
    'group',
    attrs.className
      ? { ...attrs, className: `journal-${String(attrs.className)}` }
      : attrs,
    children,
  );

/** A wrapper that only adds a layout hook: no container, padding or gap of its own. */
const hook = (className: string, children: BlockInput[]) =>
  group(
    { layout: 'stack', align: 'stretch', gap: 'none', className },
    children,
  );

const header: BlockInput[] = [
  group(
    {
      tagName: 'header',
      width: 'wide',
      border: 'bottom',
      background: 'base',
      sticky: true,
      gap: 'none',
      className: 'header',
    },
    [
      group(
        {
          layout: 'flex',
          justify: 'between',
          align: 'stretch',
          wrap: false,
          gap: 'none',
          className: 'header-bar',
        },
        [
          group(
            {
              layout: 'flex',
              gap: 'small',
              wrap: false,
              className: 'brand',
            },
            [block('site-logo', { width: 120 }), block('site-title')],
          ),
          block('navigation'),
          group(
            {
              layout: 'flex',
              justify: 'end',
              gap: 'small',
              wrap: false,
              className: 'tools',
            },
            [block('scheme-toggle'), block('search', { panel: true })],
          ),
        ],
      ),
    ],
  ),
];

const footer: BlockInput[] = [
  group(
    {
      tagName: 'footer',
      width: 'wide',
      background: 'surface',
      gap: 'none',
      className: 'footer',
    },
    [
      group(
        {
          layout: 'stack',
          align: 'start',
          gap: 'none',
          className: 'footer-top',
        },
        [
          block('site-title', { link: false }),
          block('site-tagline'),
          block('navigation', { location: 'footer', overlay: false }),
          block('widget-area', { area: 'footer', layout: 'columns' }),
        ],
      ),
      group(
        {
          layout: 'flex',
          justify: 'between',
          gap: 'medium',
          className: 'footer-bottom',
        },
        [block('copyright'), block('privacy-policy-link')],
      ),
    ],
  ),
];

/** One post in a grid: image, date and comments, title, excerpt, category. */
const card = (level: number) =>
  block('post-template', {}, [
    block('post-featured-image', { aspect: 'wide' }),
    block('post-meta', { showAuthor: false, commentIcon: true }),
    block('post-title', { level, link: true, size: 'medium' }),
    block('post-excerpt', { excerptLength: 18 }),
    block('post-terms'),
  ]);

/** The page's posts: three cards per row on desktop, two on tablets, one on phones. */
const posts = () =>
  hook('posts', [
    block('query', { layout: 'grid', columns: 3, gap: 'large' }, [
      card(2),
      block('query-no-results'),
      block('query-pagination'),
    ]),
  ]);

const main = (className: string, children: BlockInput[]) =>
  group({ tagName: 'main', width: 'wide', gap: 'none', className }, children);

const page = (className: string, children: BlockInput[]) => [
  part('header'),
  main(className, children),
  part('footer'),
];

/** The title band of archives and search results. */
const pageHeader = (children: BlockInput[]) => hook('page-header', children);

const archive = () =>
  page('main', [pageHeader([block('query-title')]), posts()]);

/** Featured image with the meta and title laid over it; without an image the title stands alone. */
const entryHeader = (single: boolean) =>
  hook('entry-header', [
    block('post-featured-image', { link: false }),
    group(
      {
        layout: 'stack',
        align: 'start',
        gap: 'none',
        className: 'entry-title',
      },
      [
        ...(single
          ? [block('post-meta', { showAuthor: false, commentIcon: true })]
          : []),
        block('post-title', { level: 1, size: 'xlarge' }),
      ],
    ),
  ]);

/** Entry content beside the sidebar widget area, which disappears while it is empty. */
const entry = (single: boolean) =>
  page('entry', [
    entryHeader(single),
    block('columns', { gap: 'large' }, [
      block('column', {}, [
        hook('entry-body', [
          block('post-content'),
          block('post-fields'),
          ...(single ? [block('post-terms', { taxonomy: 'tag' })] : []),
        ]),
        ...(single ? [block('post-navigation')] : []),
        block('comments'),
      ]),
      block('column', { width: 34 }, [block('widget-area')]),
    ]),
  ]);

const TEMPLATES: Record<string, BlockInput[]> = {
  index: archive(),
  archive: archive(),
  home: page('main', [
    block('query-title'),
    block('content-type-nav'),
    posts(),
  ]),
  search: page('main', [
    pageHeader([block('query-title'), block('search')]),
    posts(),
  ]),
  single: entry(true),
  page: entry(false),
  404: page('main', [
    hook('not-found', [block('query-title'), block('search')]),
  ]),
};

/** Breakpoints as container queries on the site root (`.cms-site` is the container). */
const SM = '@container (min-width: 36rem)';
const MD = '@container (min-width: 48rem)';
const LG = '@container (min-width: 62rem)';
const XL = '@container (min-width: 75rem)';
const XXL = '@container (min-width: 103.75rem)';
const BELOW_LG = '@container (max-width: 61.99rem)';

const heading = 'font-family: var(--cms-heading-font)';
/** The link underline: a 1px gradient that grows or shrinks on hover. */
const underline =
  'background: linear-gradient(to right, currentColor 0%, currentColor 98%) no-repeat left 98% / 100% 1px; text-decoration: none; transition: background-size 0.25s, color 0.25s';

const CSS = `
:scope { letter-spacing: normal; }
a { text-underline-offset: 0.2em; }
.cms-heading { font-weight: 700; letter-spacing: -0.04em; line-height: 1.12; }

/* Container: 24px gutters, 48px from 992px, within the wide size (a 1200px frame) */
.cms-constrained > .cms-inner { padding-inline: 24px; gap: 0; }
${LG} { .cms-constrained > .cms-inner { padding-inline: 48px; } }

/* Header */
.theme-journal-header { z-index: 40; transition: background-color 0.3s; }
.theme-journal-header-bar { min-height: 80px; }
.theme-journal-brand { flex: 1 1 0; min-width: 0; }
.theme-journal-brand .cms-block-site-logo img { max-height: 60px; width: auto; }
.theme-journal-header .cms-block-site-title { ${heading}; font-size: 1.375rem; font-weight: 700; letter-spacing: -0.04em; line-height: 1.5; white-space: nowrap; }
.theme-journal-header .cms-block-site-title a:hover { opacity: 1; }
.theme-journal-tools { flex: 1 1 0; gap: 0.5rem; }
.theme-journal-header .cms-block-navigation { display: flex; align-self: stretch; }
.cms-navigation-bar { display: none; height: 100%; }
${LG} {
  .cms-navigation-bar { display: block; padding-inline: 20px; }
  .cms-navigation-toggle { display: none; }
}
.cms-navigation-bar > ul { height: 100%; flex-wrap: nowrap; gap: 2rem; font-size: 1rem; }
.cms-navigation-bar > ul > li { display: flex; align-items: stretch; }
.cms-navigation-bar > ul > li > a {
  ${heading}; height: 100%; padding: 0; border-radius: 0; background: none; color: var(--foreground);
  font-weight: 500; letter-spacing: -0.03em; line-height: 1.4; white-space: nowrap;
}
.cms-navigation-bar > ul > li > a:hover { background: none; color: var(--foreground); }
.cms-navigation-bar > ul > li > a svg { width: 1.125rem; height: 1.125rem; opacity: 1; margin-left: 2px; }
.cms-navigation-bar > ul > li:not(:has(> div))::after {
  content: ''; position: absolute; left: 0; bottom: -1px; width: 100%; height: 3px; background: var(--cms-color-accent);
  transform: scaleX(0); transform-origin: bottom right; transition: transform 0.3s ease;
}
.cms-navigation-bar > ul > li:not(:has(> div)):hover::after { transform: scaleX(1); transform-origin: bottom left; }
.cms-navigation-bar > ul > li:has(> a[aria-current='page'])::after { transform: scaleX(1); }
.cms-navigation-bar > ul > li > div { top: calc(100% - 12px); padding-top: 0; }
.cms-navigation-bar li > div > div {
  border: 0; border-radius: 8px; padding: 0.5rem 0; background: var(--cms-color-submenu);
  box-shadow: 0 0 25px 0 rgb(0 0 0 / 0.08);
}
.cms-navigation-bar li > div a {
  ${heading}; min-width: 200px; padding: 0.625rem 1.25rem; border-radius: 0; background: none;
  color: var(--foreground); font-size: 1rem; font-weight: 500; letter-spacing: -0.03em; line-height: 1.4;
}
.cms-navigation-bar li > div a:hover { background: none; color: var(--cms-color-accent); }
.cms-offcanvas a { ${heading}; font-size: 1rem; font-weight: 500; letter-spacing: -0.03em; color: var(--foreground); }
.cms-offcanvas .cms-block-site-title { ${heading}; font-size: 1.375rem; font-weight: 700; letter-spacing: -0.04em; }
${BELOW_LG} {
  .theme-journal-header-bar .cms-block-navigation { order: -1; flex: 1 1 0; }
  .cms-navigation-toggle { display: flex; }
  .theme-journal-brand { flex: 0 0 auto; justify-content: center; }
  .theme-journal-tools .cms-block-scheme-toggle { display: none; }
}

/* Header buttons: 40px circles */
.theme-journal-header :is(.cms-search-toggle, .cms-block-scheme-toggle, .cms-navigation-toggle):not(.cms-offcanvas *) {
  width: 40px; height: 40px; border-radius: 50%; color: var(--foreground); background: none;
}
.theme-journal-header :is(.cms-search-toggle, .cms-block-scheme-toggle):not(.cms-offcanvas *):hover { background: var(--cms-color-surface); color: var(--foreground); }
.theme-journal-header :is(.cms-search-toggle, .cms-block-scheme-toggle):not(.cms-offcanvas *) svg { width: 20px; height: 20px; }
.theme-journal-header .cms-navigation-toggle svg { width: 24px; height: 24px; }
.theme-journal-header .cms-navigation-toggle:hover { background: none; opacity: 0.7; }

/* Search panel and search forms */
.cms-search-panel { padding-bottom: 2.5rem; }
${XXL} { .cms-search-panel { padding-bottom: 5rem; } }
.cms-search-panel h2 { ${heading}; font-size: 2rem; font-weight: 700; letter-spacing: -0.04em; line-height: 1.12; }
${BELOW_LG} { .cms-search-panel h2 { font-size: 1.5rem; } }
.cms-search-panel-terms a {
  ${heading}; display: flex; padding: 0.375rem 0.75rem; border-radius: 4px; background: var(--cms-color-surface);
  color: var(--cms-color-muted); font-size: 0.9375rem; font-weight: 500; letter-spacing: -0.03em; line-height: 1.4; text-decoration: none;
}
.cms-search-panel-terms a:hover { background: var(--cms-color-tag-hover); color: var(--cms-color-muted); }
.cms-block-search > div { height: auto; gap: 0.5rem; padding: 0; border: 0; background: none; box-shadow: none; }
.cms-block-search > div:focus-within { box-shadow: none; }
.cms-block-search input {
  ${heading}; flex: 1 1 auto; width: 100%; height: auto; padding: 0.9375rem 1.5rem; border-radius: 26px; background: var(--cms-color-surface);
  color: var(--foreground); font-size: 1rem; font-weight: 500; letter-spacing: -0.025em; line-height: 1.4;
}
.cms-block-search input:focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; }
.cms-block-search button[type='submit'] {
  width: auto; height: auto; min-height: 52px; padding: 0.9375rem 1.5rem; border-radius: 26px;
  background: var(--cms-color-button); color: var(--cms-color-button-text);
  font-weight: 700; letter-spacing: -0.03em; line-height: 1.4;
}
.cms-block-search button[type='submit']:hover { background: var(--cms-color-button-hover); color: var(--cms-color-button-text); }
.cms-block-search button[type='submit'] svg { display: none; }
.cms-block-search button[type='submit'] .cms-search-submit-label {
  position: static; width: auto; height: auto; margin: 0; overflow: visible; clip-path: none; white-space: nowrap;
}
${BELOW_LG} {
  .cms-search-panel .cms-block-search > div { flex-direction: column; align-items: stretch; gap: 1rem; }
}

/* Main region */
:is(.theme-journal-main, .theme-journal-entry) > .cms-inner { padding-top: 2.5rem; padding-bottom: 4rem; }
${MD} { :is(.theme-journal-main, .theme-journal-entry) > .cms-inner { padding-bottom: 6rem; } }
${LG} { .theme-journal-main > .cms-inner { padding-top: 3rem; } :is(.theme-journal-main, .theme-journal-entry) > .cms-inner { padding-bottom: 6.5rem; } }
${XXL} { .theme-journal-main > .cms-inner { padding-top: 4rem; } }
.theme-journal-entry > .cms-inner { padding-top: 1.5rem; }
.cms-block-content-type-nav { margin-bottom: 2.5rem; }
.theme-journal-page-header { margin-bottom: 4rem; max-width: 50rem; }
.theme-journal-page-header .cms-block-query-title p:first-child { color: var(--cms-color-muted); letter-spacing: 0; text-transform: none; font-size: 1rem; font-weight: 500; }
.theme-journal-page-header .cms-block-query-title :is(h1, h2) { font-size: 1.75rem; }
${MD} { .theme-journal-page-header .cms-block-query-title :is(h1, h2) { font-size: 2rem; } }
${LG} { .theme-journal-page-header .cms-block-query-title :is(h1, h2) { font-size: 2.5rem; } }
${XXL} { .theme-journal-page-header .cms-block-query-title :is(h1, h2) { font-size: 3.5rem; } }
.theme-journal-page-header .cms-block-search { margin-top: 2rem; max-width: 50rem; }
.theme-journal-not-found { align-items: center; text-align: center; gap: 1.5rem; }
.theme-journal-not-found .cms-block-query-title { max-width: 50rem; }
.theme-journal-not-found .cms-block-search { width: 100%; max-width: 50rem; }

/* Post grids */
.cms-block-query { gap: 0; }
.cms-block-post-template {
  --sw-row-gap: 40px; --sw-column-gap: 24px;
  grid-template-columns: minmax(0, 1fr); gap: var(--sw-row-gap) var(--sw-column-gap);
}
${SM} { .cms-block-post-template { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
${LG} { .cms-block-post-template { grid-template-columns: repeat(3, minmax(0, 1fr)); --sw-row-gap: 48px; } }
${XL} { .cms-block-post-template { --sw-row-gap: 64px; --sw-column-gap: 32px; } }
.cms-block-post-template > li {
  gap: 0; padding: 0; border: 0; border-radius: 0; background: none; box-shadow: none; overflow: visible; color: inherit;
}
.cms-block-post-template > li:hover { box-shadow: none; }
.cms-block-post-template .cms-block-post-featured-image { position: relative; margin-bottom: 1rem; border-radius: 8px; overflow: hidden; }
.cms-block-post-template .cms-block-post-featured-image img { border-radius: 8px; scale: none; transform: none; }
.cms-block-post-template .cms-block-post-featured-image::after {
  content: ''; position: absolute; inset: 0; border-radius: 8px; background: rgb(0 0 0 / 0.1);
  opacity: 0; transition: opacity 0.25s; pointer-events: none;
}
.cms-block-post-template .cms-block-post-featured-image:hover::after { opacity: 1; }
.cms-block-post-template .cms-block-post-title { ${heading}; margin-top: 0.75rem; font-size: 1.5rem; font-weight: 600; letter-spacing: -0.03em; line-height: 1.3; text-wrap: wrap; }
.cms-block-post-template .cms-block-post-meta + .cms-block-post-title, .cms-block-post-template .cms-block-post-title:first-child { margin-top: 0.75rem; }
.cms-block-post-template .cms-block-post-title a { display: block; color: var(--foreground); text-decoration: none; transition: color 0.25s; }
.cms-block-post-template .cms-block-post-title a:hover { color: var(--cms-color-title-hover); text-decoration: none; }
.cms-block-post-template .cms-block-post-excerpt { margin-block: 0.5rem; }
.cms-block-post-template .cms-block-post-excerpt p { ${heading}; color: var(--cms-color-excerpt); font-size: 1rem; font-weight: 500; letter-spacing: -0.03em; line-height: 1.4; }
${MD} {
  .cms-block-post-template .cms-block-post-title { margin-top: 0.875rem; }
  .cms-block-post-template .cms-block-post-excerpt { margin-block: 0.875rem; }
  .cms-block-post-template .cms-block-post-excerpt p { font-size: 1.125rem; }
}
.cms-block-post-template .cms-block-post-terms { margin-top: 0.5rem; }
.cms-block-post-template .cms-block-post-excerpt + .cms-block-post-terms { margin-top: 0; }

/* Post meta: date, a dot, the comment count */
.cms-block-post-meta {
  ${heading}; gap: 0.5rem; color: var(--cms-color-muted); font-size: 0.875rem; font-weight: 600; letter-spacing: -0.03em; line-height: 1.2;
}
${XL} { .cms-block-post-meta { font-size: 1rem; } }
.cms-block-post-meta > span[aria-hidden='true'] {
  width: 5px; height: 5px; overflow: hidden; border-radius: 50%; background: var(--cms-color-separator); color: transparent; font-size: 0;
}
.cms-block-post-meta a { color: var(--foreground); text-decoration: none; transition: color 0.25s, opacity 0.25s; }
.cms-block-post-meta a:hover { color: var(--cms-color-accent); }
.cms-post-comments svg { width: 0.75em; height: 0.75em; margin-right: 0.25rem; }

/* Category and tag labels */
.cms-block-post-terms > div { gap: 0.5rem; }
.cms-block-post-terms a {
  ${heading}; display: flex; align-items: center; padding: 0.375rem 0.75rem; border-radius: 4px;
  background: var(--cms-color-surface); color: var(--cms-color-muted);
  font-size: 0.9375rem; font-weight: 500; letter-spacing: -0.03em; line-height: 1.4; text-decoration: none;
}
${BELOW_LG} { .cms-block-post-template .cms-block-post-terms a { font-size: 0.75rem; } }
.cms-block-post-terms a:hover { background: var(--cms-color-tag-hover); color: var(--cms-color-muted); text-decoration: none; }

/* Pagination */
.cms-block-query > nav { justify-content: center; gap: 0.5rem; margin-top: 3rem; }
${LG} { .cms-block-query > nav { margin-top: 4.5rem; } }
.cms-block-query > nav a {
  ${heading}; min-width: 2.5rem; padding: 0.5rem 0.875rem; border: 0; border-radius: 26px; text-align: center;
  background: var(--cms-color-surface); color: var(--foreground); font-weight: 600; text-decoration: none;
}
.cms-block-query > nav a:hover { background: var(--cms-color-tag-hover); }
.cms-block-query > nav a[aria-current='page'] { background: var(--cms-color-button); color: var(--cms-color-button-text); }

/* Entry header: the featured image with the meta and title over it */
.theme-journal-entry-header { position: relative; margin-bottom: 2.5rem; }
${LG} { .theme-journal-entry-header { margin-bottom: 3rem; } }
${XXL} { .theme-journal-entry-header { margin-bottom: 4rem; } }
.theme-journal-entry-header .cms-block-post-featured-image { position: relative; margin: 0; border-radius: 8px; overflow: hidden; }
.theme-journal-entry-header .cms-block-post-featured-image img { width: 100%; height: 100%; min-height: 380px; aspect-ratio: 1; object-fit: cover; border-radius: 8px; }
${SM} { .theme-journal-entry-header .cms-block-post-featured-image img { aspect-ratio: 5 / 3; } }
${MD} { .theme-journal-entry-header .cms-block-post-featured-image img { aspect-ratio: 2 / 1; } }
${LG} { .theme-journal-entry-header .cms-block-post-featured-image img { aspect-ratio: 20 / 7; } }
.theme-journal-entry-header .cms-block-post-featured-image::after { content: ''; position: absolute; inset: 0; border-radius: 8px; background: rgb(0 0 0 / 0.5); pointer-events: none; }
.theme-journal-entry-header:has(.cms-block-post-featured-image) .theme-journal-entry-title {
  position: absolute; inset: 0; justify-content: flex-end; padding: 24px; color: #fff;
  --foreground: #fff; --cms-color-muted: rgb(255 255 255 / 0.7); --cms-color-separator: rgb(255 255 255 / 0.3);
}
${LG} { .theme-journal-entry-header:has(.cms-block-post-featured-image) .theme-journal-entry-title { justify-content: flex-end; padding: 64px; } }
.theme-journal-entry-header:has(.cms-block-post-featured-image) .cms-block-post-meta a:hover { color: #fff; opacity: 0.7; }
.theme-journal-entry-title .cms-block-post-title { ${heading}; max-width: 50rem; margin-top: 0; font-size: 1.75rem; font-weight: 700; letter-spacing: -0.04em; line-height: 1.2; }
.theme-journal-entry-title .cms-block-post-meta + .cms-block-post-title { margin-top: 1rem; }
${MD} { .theme-journal-entry-title .cms-block-post-title { font-size: 2rem; } }
${LG} {
  .theme-journal-entry-title .cms-block-post-title { font-size: 2.5rem; line-height: 1.12; }
  .theme-journal-entry-title .cms-block-post-meta + .cms-block-post-title { margin-top: 1.25rem; }
}
${XL} { .theme-journal-entry-title .cms-block-post-meta { font-size: 1.125rem; } }
${XXL} { .theme-journal-entry-title .cms-block-post-title { font-size: 3.5rem; } }

/* Content beside the sidebar (360px from 992px, 400px from 1200px) */
.theme-journal-entry .cms-block-columns { flex-direction: column; gap: 3rem; }
${LG} {
  .theme-journal-entry .cms-block-columns { flex-direction: row; gap: 48px; }
  .theme-journal-entry .cms-block-column:has(.cms-block-widget-area) { flex: 0 0 360px; }
}
${XL} { .theme-journal-entry .cms-block-column:has(.cms-block-widget-area) { flex-basis: 400px; } }
.theme-journal-entry .cms-block-column { gap: 0; }

/* Entry content */
.theme-journal-entry-body .cms-block-post-content { width: 100%; max-width: var(--cms-content-size); margin-inline: auto; }
.theme-journal-entry .cms-block-column:only-child .cms-block-post-content { max-width: 50rem; }
.cms-prose {
  ${heading}; color: var(--cms-color-text); font-size: 1.125rem; font-weight: 400; letter-spacing: -0.03em; line-height: 1.5;
  --tw-prose-body: var(--cms-color-text); --tw-prose-bullets: var(--cms-color-text); --tw-prose-counters: var(--cms-color-text);
}
${MD} { .cms-prose { font-size: 1.25rem; } }
.cms-prose > * { margin-block: 32px; }
.cms-prose > :first-child { margin-top: 0; }
.cms-prose > :last-child { margin-bottom: 0; }
.cms-prose :is(p, ul, ol, li, blockquote, figure, table) { line-height: 1.5; }
.cms-prose :is(h1, h2, h3, h4, h5, h6) { ${heading}; color: var(--foreground); font-weight: 700; letter-spacing: -0.04em; line-height: 1.12; margin-top: 32px; margin-bottom: 16px; }
.cms-prose :is(h1, h2, h3, h4, h5, h6) + * { margin-top: 16px; }
.cms-prose h1 { font-size: 1.75rem; }
.cms-prose h2 { font-size: 1.5rem; }
.cms-prose :is(h3, h4) { font-size: 1.25rem; }
.cms-prose h5 { font-size: 1.125rem; }
.cms-prose h6 { font-size: 1rem; }
${MD} {
  .cms-prose h1 { font-size: 2rem; }
  .cms-prose h2 { font-size: 1.75rem; }
  .cms-prose h3 { font-size: 1.5rem; }
  .cms-prose h4 { font-size: 1.375rem; }
  .cms-prose h5 { font-size: 1.25rem; }
  .cms-prose h6 { font-size: 1.125rem; }
}
${LG} {
  .cms-prose h1 { font-size: 2.5rem; }
  .cms-prose h2 { font-size: 2rem; }
  .cms-prose h3 { font-size: 1.75rem; }
  .cms-prose h4 { font-size: 1.5rem; }
  .cms-prose h5 { font-size: 1.375rem; }
  .cms-prose h6 { font-size: 1.25rem; }
}
${XXL} {
  .cms-prose h1 { font-size: 3.5rem; }
  .cms-prose h2 { font-size: 2.5rem; }
  .cms-prose h3 { font-size: 2rem; }
  .cms-prose h4 { font-size: 1.625rem; }
}
.cms-prose a:not([class]) { color: var(--cms-color-accent); font-weight: inherit; padding-bottom: 0.0625em; ${underline}; }
.cms-prose a:not([class]):hover { background-size: 0 1px; color: var(--cms-color-accent); }
.cms-prose :is(ul, ol) { padding-left: 2.5rem; }
.cms-prose li { margin-block: 0; padding-left: 0; }
.cms-prose li::marker { color: inherit; }
.cms-prose blockquote:not(.cms-pullquote blockquote) {
  ${heading}; display: flex; flex-direction: column; align-items: center; margin-block: 48px; padding: 40px;
  border: 0; border-radius: 4px; background: var(--cms-color-surface); color: var(--foreground);
  font-size: 1.5rem; font-style: normal; font-weight: 700; letter-spacing: -0.04em; line-height: 1.12; text-align: center; quotes: none;
}
.cms-prose blockquote p { margin-block: 0; line-height: 1.5; }
.cms-prose blockquote p::before, .cms-prose blockquote p::after { content: none; }
.cms-prose :not(pre) > code { padding: 0.1em 0.3em; border-radius: 3px; background: var(--cms-color-code); color: var(--foreground); font-size: 0.875em; font-weight: 400; }
.cms-prose :not(pre) > code::before, .cms-prose :not(pre) > code::after { content: none; }
.cms-prose :is(table, .cms-table) { width: 100%; border-collapse: collapse; font-size: 1rem; }
.cms-prose :is(th, td) { padding: 0.75rem; border: 1px solid var(--cms-color-table-border); vertical-align: middle; }
.cms-prose th { ${heading}; font-weight: 700; letter-spacing: -0.04em; line-height: 1.12; }
.cms-prose thead { border-bottom: 2px solid var(--cms-color-table-border); }
.cms-prose img { border-radius: 8px; }
.cms-prose :is(figcaption, caption) { margin-top: 1rem; color: var(--cms-color-muted); font-size: 1rem; text-align: left; }
.cms-prose hr { border-top-color: var(--cms-color-table-border); }
.cms-prose :is(a, pre, code) { overflow-wrap: anywhere; word-break: break-word; }

/* Tags under the content */
.theme-journal-entry-body .cms-block-post-terms { margin-top: 3.5rem; }
.theme-journal-entry-body .cms-block-post-terms a { height: 30px; padding-block: 0; line-height: 1; }

/* Sidebar widgets */
.theme-journal-entry .cms-block-widget-area > div { display: block; }
${LG} { .theme-journal-entry .cms-block-widget-area { position: sticky; top: calc(var(--cms-admin-bar, 0px) + 81px + 20px); } }
.theme-journal-entry .cms-block-widget-area section { margin: 0 0 40px; padding-bottom: 40px; border-bottom: 1px solid var(--border); font-size: 1rem; }
.theme-journal-entry .cms-block-widget-area section > h2 { ${heading}; margin-bottom: 1.75rem; color: var(--foreground); font-size: 1.25rem; font-weight: 700; letter-spacing: -0.04em; line-height: 1.12; }
.theme-journal-entry .cms-block-widget-area section li { padding-block: 12px; }
.theme-journal-entry .cms-block-widget-area section li + li { margin-top: 0; border-top: 1px solid var(--border); }
.theme-journal-entry .cms-block-widget-area section li:first-child { padding-top: 0; }
.theme-journal-entry .cms-block-widget-area section li a { ${heading}; color: var(--foreground); font-size: 1.125rem; font-weight: 600; letter-spacing: -0.03em; line-height: 1.3; text-decoration: none; }
.theme-journal-entry .cms-block-widget-area section li a:hover { color: var(--cms-color-title-hover); text-decoration: none; }

/* Previous and next entry */
.cms-block-post-navigation { margin-top: 3.5rem; padding-top: 2rem; gap: 2rem; border-top: 1px solid var(--border); font-size: 1rem; }
.cms-block-post-navigation a { gap: 0.5rem; text-decoration: none; }
.cms-block-post-navigation a span:first-child { ${heading}; color: var(--cms-color-muted); font-size: 0.875rem; font-weight: 600; letter-spacing: -0.03em; }
.cms-block-post-navigation a span:last-child { ${heading}; color: var(--foreground); font-size: 1.25rem; font-weight: 600; letter-spacing: -0.03em; line-height: 1.3; text-decoration: none; transition: color 0.25s; }
.cms-block-post-navigation a:hover span:last-child { color: var(--cms-color-title-hover); text-decoration: none; }

/* Comments: a rounded box on the layout color */
.cms-block-comments { margin-top: 2rem; }
${MD} { .cms-block-comments { margin-top: 4rem; } }
.cms-block-comments > section {
  max-width: none; margin: 0; padding: 1.5rem; border: 0; border-radius: 8px; background: var(--cms-color-surface);
}
${SM} { .cms-block-comments > section { padding: 2.5rem; } }
${XL} { .cms-block-comments > section { padding: 3rem; } }
${XXL} { .cms-block-comments > section { padding: 5rem; } }
.cms-block-comments > section > div:first-child h2, .cms-block-comments form h3 { ${heading}; font-size: 2rem; font-weight: 700; letter-spacing: -0.04em; line-height: 1.2; }
.cms-block-comments form { padding: 0; border: 0; border-radius: 0; background: none; }
.cms-block-comments form label { ${heading}; font-size: 1rem; font-weight: 500; letter-spacing: -0.025em; }
.cms-block-comments form :is(input:not([type='checkbox'], [type='hidden']), textarea) {
  height: auto; padding: 0.9375rem 1.5rem; border: 0; border-radius: 26px; background: var(--cms-color-base);
  color: var(--foreground); font-size: 1rem; font-weight: 500; line-height: 1.4;
}
.cms-block-comments form textarea { min-height: 110px; border-radius: 4px; }
.cms-block-comments form button[type='submit'] {
  height: auto; min-height: 52px; padding: 0.9375rem 1.5rem; border-radius: 26px;
  background: var(--cms-color-button); color: var(--cms-color-button-text); font-size: 1rem; font-weight: 700; letter-spacing: -0.03em;
}
.cms-block-comments form button[type='submit']:hover { background: var(--cms-color-button-hover); }
.cms-block-comments ol > li { border-color: var(--border); }

/* Footer */
.theme-journal-footer { margin-top: auto; }
.theme-journal-footer-top { gap: 0.75rem; padding: 3rem 0 1.5rem; }
${XL} { .theme-journal-footer-top { padding: 4rem 0 2.5rem; } }
.theme-journal-footer .cms-block-site-title { ${heading}; font-size: 1.375rem; font-weight: 700; letter-spacing: -0.04em; line-height: 1.5; color: var(--foreground); }
.theme-journal-footer .cms-block-site-tagline { max-width: 100%; color: var(--foreground); font-size: 0.9375rem; letter-spacing: -0.03em; line-height: 1.5; text-wrap: balance; }
.theme-journal-footer .cms-block-navigation a { ${heading}; padding: 0; color: var(--foreground); font-size: 1rem; font-weight: 500; letter-spacing: -0.03em; }
.theme-journal-footer .cms-block-navigation a:hover { background: none; color: var(--cms-color-accent); }
.theme-journal-footer-bottom { padding: 1.5rem 0; border-top: 1px solid var(--border); }
${XL} { .theme-journal-footer-bottom { padding: 2.5rem 0; } }
.theme-journal-footer-bottom :is(.cms-block-copyright, a) { color: var(--cms-color-muted); font-size: 0.9375rem; letter-spacing: -0.03em; line-height: 1.5; }

@media (prefers-reduced-motion: reduce) {
  .cms-navigation-bar > ul > li::after, .cms-block-post-featured-image::after { transition: none; }
}
`;

/** Journal's color tokens by palette slug: the six roles drive the interface, the rest the stylesheet. */
const NAMES: Record<string, string> = {
  base: 'Site background',
  surface: 'Layout background',
  contrast: 'Primary',
  muted: 'Secondary',
  accent: 'Accent',
  border: 'Border',
  text: 'Entry content',
  excerpt: 'Excerpt',
  separator: 'Meta separator',
  'title-hover': 'Title hover',
  'tag-hover': 'Label hover',
  submenu: 'Submenu',
  code: 'Inline code',
  'table-border': 'Table border',
  button: 'Button',
  'button-text': 'Button text',
  'button-hover': 'Button hover',
};

const palette = (colors: Record<string, string>): ThemePaletteColor[] =>
  Object.entries(colors).map(([slug, color]) => ({
    slug,
    name: NAMES[slug] ?? slug,
    color,
  }));

/** The default, dark scheme. */
const DARK = {
  base: '#1c1c1c',
  surface: '#232323',
  contrast: '#ffffff',
  muted: '#cdcdcd',
  accent: '#5ebeff',
  border: '#343434',
  text: '#ffffff',
  excerpt: '#dddddd',
  separator: '#616161',
  'title-hover': '#bbbbbb',
  'tag-hover': '#3e3e3e',
  submenu: '#232323',
  code: '#000000',
  'table-border': '#494949',
  button: '#3e3e3e',
  'button-text': '#ffffff',
  'button-hover': '#232323',
};

/** The light scheme the visitor can switch to. */
const LIGHT = {
  base: '#ffffff',
  surface: '#f1f1f1',
  contrast: '#1d1d1d',
  muted: '#6e6e6e',
  accent: '#0d6eff',
  border: '#e4e4e4',
  text: '#343434',
  excerpt: '#6e6e6e',
  separator: '#d2d2d2',
  'title-hover': '#4a4a4a',
  'tag-hover': '#ededed',
  submenu: '#ffffff',
  code: '#f8f9fa',
  'table-border': '#e0e0e0',
  button: '#1d1d1d',
  'button-text': '#ffffff',
  'button-hover': '#0d6eff',
};

/** System fonts after a web font, with the platform Korean faces. */
const SYSTEM =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';

/**
 * Body text names Nanum Gothic first: it shows once an administrator adds that family in the
 * site fonts (Appearance → Editor → Styles); until then the system faces stand in.
 */
const NANUM_GOTHIC = `"Nanum Gothic", ${SYSTEM}`;

export const journalTheme = (): ThemePackage =>
  themePackageSchema.parse({
    manifest: {
      id: 'journal',
      name: 'Journal',
      version: '3.0.0',
      description:
        'A dark magazine-style blog with a sky-blue accent: a grid of image cards, a right sidebar on entries, a search panel and a light/dark toggle.',
      author: 'CMS',
      settings: {
        color: { palette: palette(DARK), alternatePalette: palette(LIGHT) },
        colorScheme: { auto: false, toggle: true },
        typography: {
          fontFamilies: [
            {
              slug: 'nanum-gothic',
              name: 'Nanum Gothic',
              fontFamily: NANUM_GOTHIC,
            },
            { slug: 'system', name: 'System UI', fontFamily: SYSTEM },
          ],
        },
        layout: { contentSize: '39.5rem', wideSize: '75rem' },
      },
      styles: {
        fontFamily: 'nanum-gothic',
        headingFontFamily: 'system',
        fontSize: 'medium',
        lineHeight: 'tight',
        radius: 'medium',
      },
      templateParts: [
        { slug: 'header', title: 'Header', area: 'header' },
        { slug: 'footer', title: 'Footer', area: 'footer' },
      ],
    },
    templates: TEMPLATES,
    parts: { header, footer },
    css: CSS,
  } satisfies ThemePackageInput);
