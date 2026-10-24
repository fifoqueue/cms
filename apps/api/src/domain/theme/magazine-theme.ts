import { themePackageSchema } from '@cms/sdk';
import type { BlockInput, ThemePackage, ThemePackageInput } from '@cms/sdk';
import { block, part, SANS, SERIF } from '#api/domain/theme/theme-blocks';

/**
 * Magazine: an editorial news layout. A sticky three-zone masthead, a lead story laid over its
 * image beside two secondary stories, a three-column story grid, archive banners, a focused
 * reading column and a dark footer. Layout classes are `className` hooks (`theme-mag-*`)
 * styled by the stylesheet below; without it the templates still read as a plain grid.
 */

const group = (attrs: Record<string, unknown>, children: BlockInput[]) =>
  block('group', attrs, children);

/** A wrapper that adds a layout hook without its own container or padding. */
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
      padding: 'small',
      border: 'bottom',
      background: 'base',
      sticky: true,
      className: 'mag-header',
    },
    [
      group(
        {
          layout: 'flex',
          justify: 'between',
          gap: 'medium',
          className: 'mag-masthead',
        },
        [
          group(
            {
              layout: 'flex',
              gap: 'small',
              wrap: false,
              className: 'mag-brand',
            },
            [block('site-logo', { width: 36 }), block('site-title')],
          ),
          block('navigation'),
          group(
            {
              layout: 'flex',
              gap: 'small',
              wrap: false,
              className: 'mag-tools',
            },
            [block('search'), block('loginout')],
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
      padding: 'large',
      gap: 'large',
      background: 'contrast',
      textColor: 'base',
      className: 'mag-footer',
    },
    [
      group(
        {
          layout: 'flex',
          justify: 'between',
          align: 'start',
          gap: 'large',
          className: 'mag-footer-top',
        },
        [
          group(
            {
              layout: 'stack',
              gap: 'small',
              align: 'start',
              className: 'mag-footer-brand',
            },
            [
              block('site-logo', { width: 40 }),
              block('site-title', { size: 'large' }),
              block('site-tagline'),
            ],
          ),
          block('navigation', { location: 'footer', overlay: false }),
        ],
      ),
      block('widget-area', { area: 'footer', layout: 'columns' }),
      group(
        {
          layout: 'flex',
          justify: 'between',
          gap: 'medium',
          border: 'top',
          padding: 'medium',
          className: 'mag-footer-bottom',
        },
        [block('copyright'), block('privacy-policy-link'), block('loginout')],
      ),
    ],
  ),
];

/** One story: image, category kicker, headline, dek and byline (the stylesheet relies on this order). */
const story = (excerpt = true) =>
  block('post-template', {}, [
    block('post-featured-image', { aspect: 'standard' }),
    block('post-terms'),
    block('post-title', { level: 2, link: true, size: 'medium' }),
    ...(excerpt ? [block('post-excerpt')] : []),
    block('post-meta'),
  ]);

const loop = (layout: 'grid' | 'list') =>
  block(
    'query',
    { layout, columns: 3, gap: 'large', divider: layout === 'list' },
    [story(), block('query-no-results'), block('query-pagination')],
  );

const main = (children: BlockInput[]) =>
  group(
    {
      tagName: 'main',
      layout: 'stack',
      align: 'stretch',
      gap: 'none',
      className: 'mag-main',
    },
    children,
  );

const section = (children: BlockInput[], width = 'wide') =>
  group({ width, padding: 'large', gap: 'large' }, children);

/** The heading band of archives, search and error pages. */
const banner = (children: BlockInput[]) =>
  group(
    {
      width: 'wide',
      padding: 'large',
      gap: 'medium',
      background: 'surface',
      border: 'bottom',
      className: 'mag-page-header',
    },
    children,
  );

const page = (children: BlockInput[]) => [
  part('header'),
  main(children),
  part('footer'),
];

const archive = () =>
  page([
    banner([block('query-title')]),
    section([hook('mag-grid', [loop('grid')])]),
  ]);

const entry = (single: boolean) =>
  page([
    group(
      {
        width: 'content',
        padding: 'large',
        gap: 'medium',
        className: 'mag-entry-header',
      },
      [
        block('breadcrumbs'),
        ...(single ? [block('post-terms')] : []),
        block('post-title', { level: 1, size: 'xlarge' }),
        ...(single ? [block('post-meta', { showUpdated: true })] : []),
      ],
    ),
    group({ width: 'wide', className: 'mag-entry-media' }, [
      block('post-featured-image', { link: false }),
    ]),
    group(
      {
        width: 'content',
        padding: 'large',
        gap: 'large',
        className: 'mag-entry-body',
      },
      [
        block('post-content'),
        block('post-fields'),
        ...(single
          ? [
              block('post-terms', { taxonomy: 'tag' }),
              block('post-author'),
              block('post-navigation'),
            ]
          : []),
        block('comments'),
      ],
    ),
  ]);

const templates: Record<string, BlockInput[]> = {
  index: archive(),
  archive: archive(),
  home: page([
    section([
      block('query-title'),
      block('content-type-nav'),
      hook('mag-layout', [
        block('columns', { gap: 'large' }, [
          block('column', {}, [hook('mag-feed', [loop('grid')])]),
          block('column', { width: 30 }, [block('widget-area')]),
        ]),
      ]),
    ]),
  ]),
  search: page([
    banner([block('query-title'), block('search')]),
    section([hook('mag-list', [loop('list')])]),
  ]),
  single: entry(true),
  page: entry(false),
  404: page([
    banner([block('query-title'), block('search')]),
    section([
      hook('mag-related', [
        block('query', { inherit: false, count: 3, layout: 'grid' }, [
          story(false),
        ]),
      ]),
    ]),
  ]),
};

const cards = ':is(.theme-mag-feed, .theme-mag-grid, .theme-mag-related)';
const image = '.cms-block-post-featured-image';
/** The site editor wraps every block in a `display: contents` frame; match both trees. */
const child = (parent: string, selector: string) =>
  `${parent} > ${selector}, ${parent} > [data-block-path] > ${selector}`;
/** Children of a story other than its image. */
const text = (parent: string) =>
  `${parent} > :not(${image}, [data-block-path]), ${parent} > [data-block-path] > :not(${image})`;
const withImage = `:is(:has(> ${image}), :has(> [data-block-path] > ${image}))`;
const lead = `.theme-mag-feed .cms-block-post-template > li:first-child${withImage}`;
const result = '.theme-mag-list .cms-block-post-template > li';

const css = `
.cms-heading { font-weight: 750; letter-spacing: -0.03em; }
.cms-prose :is(h2, h3, h4) { letter-spacing: -0.025em; }
a:focus-visible, button:focus-visible, summary:focus-visible { outline: 2px solid var(--ring); outline-offset: 3px; }

/* Masthead */
.theme-mag-masthead { min-height: 3.25rem; }
.theme-mag-brand { min-width: 0; }
.theme-mag-brand .cms-block-site-title { font-size: 1.5rem; font-weight: 800; letter-spacing: -0.045em; line-height: 1; }
.theme-mag-brand .cms-block-site-title a:hover { opacity: 1; color: var(--primary); }
.theme-mag-header .cms-block-navigation { flex: 1 1 auto; display: flex; justify-content: center; }
.theme-mag-header .cms-block-navigation a { color: var(--foreground); font-weight: 550; }
.theme-mag-header .cms-block-navigation a:hover { background: transparent; color: var(--primary); }
.theme-mag-header .cms-block-navigation a[aria-current='page'] { color: var(--primary); box-shadow: inset 0 -2px 0 var(--primary); }
.theme-mag-tools .cms-block-loginout { font-weight: 550; white-space: nowrap; }
@container (max-width: 47.99rem) {
  .theme-mag-header.cms-sticky { position: relative; }
  .theme-mag-masthead { flex-wrap: wrap; row-gap: 0.75rem; }
  .theme-mag-brand { flex: 1 1 0; }
  .theme-mag-header .cms-block-navigation { flex: 0 0 auto; justify-content: flex-end; }
  .theme-mag-tools { order: 3; flex: 1 1 100%; }
  .theme-mag-tools .cms-block-search { flex: 1 1 auto; }
  .theme-mag-tools .cms-block-search input { width: 100%; }
}

/* Story cards */
${cards}, .theme-mag-list { container-type: inline-size; }
${cards} .cms-block-post-template { display: grid; grid-template-columns: minmax(0, 1fr); gap: 2.75rem 2rem; }
@container (min-width: 34rem) { ${cards} .cms-block-post-template { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@container (min-width: 46rem) { ${cards} .cms-block-post-template { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
${cards} .cms-block-post-template > li {
  position: relative; gap: 0.55rem; padding: 0; border: 0; border-radius: 0;
  background: none; box-shadow: none; overflow: visible; color: inherit;
}
.cms-block-post-template ${image} { margin-bottom: 0.35rem; border-radius: var(--radius); }
:is(.cms-block-post-template, .theme-mag-entry-header) .cms-block-post-terms a {
  color: var(--primary); font-size: 0.72rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;
}
.cms-block-post-template .cms-block-post-title { font-size: 1.375rem; line-height: 1.2; }
.cms-block-post-template .cms-block-post-title a {
  text-decoration: none; background-image: linear-gradient(currentColor, currentColor);
  background-repeat: no-repeat; background-position: 0 100%; background-size: 0 0.08em;
  transition: background-size 0.3s ease;
}
.cms-block-post-template .cms-block-post-title a:is(:hover, :focus-visible) { background-size: 100% 0.08em; }
.cms-block-post-template .cms-block-post-excerpt p {
  font-size: 0.95rem; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; overflow: hidden;
}
.cms-block-post-template .cms-block-post-meta { font-size: 0.8rem; }

/* Lead story and its two companions */
.theme-mag-feed .cms-block-post-template > li:first-child .cms-block-post-title { font-size: clamp(1.6rem, 4.2cqi, 2.75rem); line-height: 1.08; }
@container (min-width: 34rem) { .theme-mag-feed .cms-block-post-template > li:first-child { grid-column: 1 / -1; } }
@container (min-width: 46rem) {
  .theme-mag-feed .cms-block-post-template > li:first-child { grid-column: 1 / span 2; grid-row: span 2; }
  .theme-mag-feed .cms-block-post-template > li:is(:nth-child(2), :nth-child(3)) .cms-block-post-excerpt { display: none; }
}
${lead} {
  display: grid; grid-template-columns: minmax(0, 1fr); grid-template-rows: 1fr repeat(4, auto); gap: 0;
  min-height: 26rem; border-radius: var(--radius); overflow: hidden; isolation: isolate; color: #fff;
  --foreground: #fff; --muted-foreground: rgb(255 255 255 / 0.85); --primary: #fff; --ring: #fff;
}
${child(lead, image)} { grid-area: 1 / 1 / -1 / -1; position: relative; z-index: -1; margin: 0; border-radius: 0; }
${lead} ${image} img { position: absolute; inset: 0; width: 100%; height: 100%; aspect-ratio: auto; border-radius: 0; }
${lead} ${image}::after {
  content: ''; position: absolute; inset: 0; pointer-events: none;
  background: linear-gradient(to top, rgb(0 0 0 / 0.92), rgb(0 0 0 / 0.72) 45%, rgb(0 0 0 / 0.3) 75%, rgb(0 0 0 / 0.1));
}
${text(lead)} { grid-column: 1; padding-inline: clamp(1.25rem, 4cqi, 2.5rem); text-shadow: 0 1px 3px rgb(0 0 0 / 0.55); }
${child(lead, '.cms-block-post-terms')} { grid-row: 2; }
${child(lead, '.cms-block-post-title')} { grid-row: 3; margin-top: 0.6rem; }
${child(lead, '.cms-block-post-excerpt')} { grid-row: 4; margin-top: 0.75rem; max-width: 40rem; }
${child(lead, '.cms-block-post-meta')} { grid-row: 5; margin-top: 1rem; padding-bottom: clamp(1.25rem, 4cqi, 2.5rem); }
${lead} .cms-block-post-terms a { display: inline-block; padding: 0.3rem 0.6rem; border-radius: 999px; background: var(--cms-color-accent); color: #fff; }
${lead} .cms-block-post-title a::after { content: ''; position: absolute; inset: 0; z-index: 1; }
${lead} :is(.cms-block-post-terms, .cms-block-post-meta) a { position: relative; z-index: 2; }

/* Search results list */
${result} { display: grid; grid-template-columns: minmax(0, 1fr); align-content: start; row-gap: 0.55rem; }
@container (min-width: 36rem) {
  ${result}${withImage} { grid-template-columns: minmax(0, 14rem) minmax(0, 1fr); grid-template-rows: auto auto auto 1fr; column-gap: 1.75rem; }
  ${child(result, image)} { grid-row: 1 / span 4; margin: 0; }
  ${text(`${result}${withImage}`)} { grid-column: 2; }
}
.cms-block-query-no-results { padding: 2.5rem 1.5rem; border: 1px dashed var(--border); border-radius: var(--radius); text-align: center; }
.cms-block-query > nav a { min-width: 2.5rem; border-radius: 999px; text-align: center; }
.cms-block-query > nav a[aria-current='page'] { background: var(--foreground); color: var(--background); border-color: var(--foreground); }

/* Banners */
.theme-mag-page-header .cms-block-query-title:not(.sr-only) { max-width: 52rem; }
.theme-mag-page-header .cms-block-query-title :is(h1, h2) { font-size: clamp(2.25rem, 6cqi, 3.75rem); line-height: 1.04; letter-spacing: -0.045em; }
.theme-mag-page-header .cms-block-search { max-width: 34rem; }
.theme-mag-page-header .cms-block-search > div { height: 3rem; }
.theme-mag-page-header .cms-block-search input { width: 100%; font-size: 1rem; }

/* Sidebar and widget labels */
@container (min-width: 48rem) { .theme-mag-layout .cms-block-column + .cms-block-column { border-left: 1px solid var(--border); padding-left: 2rem; } }
:is(.theme-mag-layout, .theme-mag-footer) .cms-block-widget-area section > h2 {
  padding-bottom: 0.5rem; border-bottom: 2px solid var(--foreground);
  font-size: 0.75rem; letter-spacing: 0.1em; text-transform: uppercase;
}

/* Article */
.theme-mag-entry-header .cms-block-post-title { font-size: clamp(2.25rem, 5.5cqi, 4rem); line-height: 1.04; letter-spacing: -0.04em; }
.theme-mag-entry-media img { max-height: 80vh; object-fit: cover; }
.theme-mag-entry-body .prose { --tw-prose-quote-borders: var(--primary); }
.theme-mag-entry-body .cms-prose { font-size: 1.125rem; }
.theme-mag-entry-body .cms-prose > p:first-child { font-size: 1.15em; color: var(--foreground); }
.theme-mag-entry-body .cms-block-post-terms a { padding: 0.3rem 0.75rem; border: 1px solid var(--border); border-radius: 999px; }
.theme-mag-entry-body .cms-block-post-author { padding-block: 1.5rem; border-block: 1px solid var(--border); }
.theme-mag-entry-body .cms-block-post-navigation { border-top: 0; padding-top: 0; }
.theme-mag-entry-body .cms-block-post-navigation a { width: 100%; padding: 1.25rem; border: 1px solid var(--border); border-radius: var(--radius); }
.theme-mag-entry-body .cms-block-post-navigation a:hover { border-color: var(--primary); }
.theme-mag-entry-body .cms-block-post-navigation a span:last-child { font-size: 1.1rem; font-weight: 700; letter-spacing: -0.02em; }

/* Footer: the palette inverted, so every core block stays legible */
.theme-mag-footer {
  --foreground: var(--cms-color-base); --background: var(--cms-color-contrast);
  --muted-foreground: color-mix(in srgb, var(--cms-color-base) 72%, var(--cms-color-contrast));
  --muted: color-mix(in srgb, var(--cms-color-base) 10%, var(--cms-color-contrast));
  --border: color-mix(in srgb, var(--cms-color-base) 18%, var(--cms-color-contrast));
  --primary: var(--cms-color-base); --ring: var(--cms-color-base);
}
.theme-mag-main { min-width: 0; }
.theme-mag-footer-top { row-gap: 1.5rem; }
.theme-mag-footer a:hover { color: var(--foreground); }
.theme-mag-footer-brand .cms-block-site-title { font-size: 1.75rem; font-weight: 800; letter-spacing: -0.045em; }
.theme-mag-footer-bottom { color: var(--muted-foreground); }

@media (prefers-reduced-motion: reduce) {
  * { transition: none; }
  .cms-block-post-featured-image img { scale: none; }
}
`;

export const MAGAZINE_THEME: ThemePackage = themePackageSchema.parse({
  manifest: {
    id: 'magazine',
    name: 'Magazine',
    version: '1.0.0',
    description:
      'A bold editorial magazine: a sticky masthead, a lead story over its image, a three-column story grid, archive banners and a focused reading column.',
    author: 'CMS',
    settings: {
      color: {
        palette: [
          { slug: 'base', name: 'Paper', color: '#ffffff' },
          { slug: 'surface', name: 'Surface', color: '#f3f2ee' },
          { slug: 'contrast', name: 'Ink', color: '#111111' },
          { slug: 'muted', name: 'Muted', color: '#5c5c5c' },
          { slug: 'accent', name: 'Crimson', color: '#c4122f' },
          { slug: 'border', name: 'Border', color: '#e2e0da' },
        ],
      },
      typography: {
        fontFamilies: [
          { slug: 'sans', name: 'Sans', fontFamily: SANS },
          { slug: 'serif', name: 'Serif', fontFamily: SERIF },
        ],
      },
      layout: { contentSize: '48rem', wideSize: '80rem' },
    },
    styles: { fontFamily: 'sans', headingFontFamily: 'sans', radius: 'medium' },
    templateParts: [
      { slug: 'header', title: 'Header', area: 'header' },
      { slug: 'footer', title: 'Footer', area: 'footer' },
    ],
  },
  templates,
  parts: { header, footer },
  css,
} satisfies ThemePackageInput);
