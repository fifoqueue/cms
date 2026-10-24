import { themePackageSchema } from '@cms/sdk';
import type {
  BlockInput,
  ThemeManifestInput,
  ThemePackage,
  ThemePackageInput,
} from '@cms/sdk';
import { MAGAZINE_THEME } from '#api/domain/theme/magazine-theme';
import { block, part, SANS, SERIF } from '#api/domain/theme/theme-blocks';

/** Ships with the core and is active until an administrator chooses another theme. */
export const DEFAULT_THEME_ID = 'canvas';

interface Variant {
  /** Post lists on the home page and in archives. */
  list: 'list' | 'grid';
  /** Width of single entries and pages. */
  entry: 'content' | 'wide';
  /** Header layout: title and navigation on one row, or a centred masthead. */
  masthead: 'row' | 'centered';
}

const header = ({ masthead }: Variant): BlockInput[] => [
  block(
    'group',
    {
      tagName: 'header',
      width: 'wide',
      padding: 'medium',
      border: 'bottom',
      background: 'base',
    },
    masthead === 'row'
      ? [
          block(
            'group',
            { layout: 'flex', justify: 'between', gap: 'medium' },
            [
              block('group', { layout: 'flex', gap: 'small', wrap: false }, [
                block('site-logo', { width: 40 }),
                block(
                  'group',
                  { layout: 'stack', gap: 'none', align: 'start' },
                  [block('site-title'), block('site-tagline')],
                ),
              ]),
              block('group', { layout: 'flex', gap: 'medium', wrap: false }, [
                block('navigation'),
                block('search'),
                block('loginout'),
              ]),
            ],
          ),
        ]
      : [
          block('group', { layout: 'stack', gap: 'small', align: 'center' }, [
            block('site-logo', { width: 72 }),
            block('site-title', { size: 'large' }),
            block('site-tagline'),
          ]),
          block('spacer', { size: 'small' }),
          block('group', { layout: 'flex', justify: 'center', gap: 'medium' }, [
            block('navigation'),
            block('search'),
            block('loginout'),
          ]),
        ],
  ),
];

const footer: BlockInput[] = [
  block(
    'group',
    {
      tagName: 'footer',
      width: 'wide',
      padding: 'medium',
      gap: 'large',
      border: 'top',
      background: 'surface',
    },
    [
      block('widget-area', { area: 'footer', layout: 'columns' }),
      block('privacy-policy-link'),
      block(
        'group',
        {
          layout: 'flex',
          justify: 'between',
          gap: 'medium',
          className: 'site-info',
        },
        [
          block('copyright'),
          block('navigation', { location: 'footer', overlay: false }),
        ],
      ),
    ],
  ),
];

/** One post in a list: image, meta, title, excerpt. */
const card = (variant: Variant) =>
  block(
    'post-template',
    {},
    variant.list === 'grid'
      ? [
          block('post-featured-image', { aspect: 'wide' }),
          block('post-meta', { showAuthor: false }),
          block('post-title', { level: 2, link: true, size: 'medium' }),
          block('post-excerpt'),
        ]
      : [
          block('post-meta'),
          block('post-title', { level: 2, link: true, size: 'large' }),
          block('post-featured-image', { aspect: 'wide' }),
          block('post-excerpt', { moreLink: true }),
          block('post-terms', { taxonomy: 'tag' }),
        ],
  );

const loop = (variant: Variant) =>
  block('query', { layout: variant.list, divider: variant.list === 'list' }, [
    card(variant),
    block('query-no-results'),
    block('query-pagination'),
  ]);

/** Main content next to the sidebar widget area; the sidebar disappears while it is empty. */
const withSidebar = (main: BlockInput[], width: 'content' | 'wide') =>
  block(
    'group',
    { tagName: 'main', width, padding: 'large', gap: 'large' },
    width === 'wide'
      ? [
          block('columns', {}, [
            block('column', { width: 0 }, main),
            block('column', { width: 28 }, [block('widget-area')]),
          ]),
        ]
      : main,
  );

const page = (
  variant: Variant,
  main: BlockInput[],
  width: 'content' | 'wide',
) => [part('header'), withSidebar(main, width), part('footer')];

const templates = (variant: Variant): Record<string, BlockInput[]> => ({
  index: page(variant, [block('query-title'), loop(variant)], 'wide'),
  home: page(
    variant,
    [block('query-title'), block('content-type-nav'), loop(variant)],
    'wide',
  ),
  search: page(
    variant,
    [
      block('query-title'),
      block('search', { showLabel: true }),
      loop({ ...variant, list: 'list' }),
    ],
    'wide',
  ),
  single: page(
    variant,
    [
      block('breadcrumbs'),
      block('group', { layout: 'stack', gap: 'small', align: 'start' }, [
        block('post-terms'),
        block('post-title', { level: 1, size: 'xlarge' }),
        block('post-meta', { showUpdated: true }),
      ]),
      block('post-featured-image', { link: false }),
      block('post-content'),
      block('post-fields'),
      block('post-terms', { taxonomy: 'tag' }),
      block('post-author'),
      block('post-navigation'),
      block('comments'),
    ],
    variant.entry,
  ),
  page: page(
    variant,
    [
      block('breadcrumbs'),
      block('post-title', { level: 1, size: 'xlarge' }),
      block('post-featured-image', { link: false }),
      block('post-content'),
      block('post-fields'),
      block('comments'),
    ],
    'content',
  ),
  404: page(
    variant,
    [block('query-title'), block('search', { showLabel: true })],
    'content',
  ),
});

const theme = (
  manifest: Omit<ThemeManifestInput, 'templateParts'>,
  variant: Variant,
  css = '',
): ThemePackage =>
  themePackageSchema.parse({
    manifest: {
      ...manifest,
      templateParts: [
        { slug: 'header', title: 'Header', area: 'header' },
        { slug: 'footer', title: 'Footer', area: 'footer' },
      ],
    },
    templates: templates(variant),
    parts: { header: header(variant), footer },
    css,
  } satisfies ThemePackageInput);

/** Themes that always exist. They cannot be replaced or removed. */
export const BUILTIN_THEMES: readonly ThemePackage[] = [
  theme(
    {
      id: DEFAULT_THEME_ID,
      name: 'Canvas',
      version: '1.0.0',
      description:
        'A clean, bright layout with crisp sans-serif type, a sidebar when you add widgets and generous spacing.',
      author: 'CMS',
      settings: {
        color: {
          palette: [
            { slug: 'base', name: 'Base', color: '#ffffff' },
            { slug: 'surface', name: 'Surface', color: '#f7f7f8' },
            { slug: 'contrast', name: 'Contrast', color: '#18181b' },
            { slug: 'muted', name: 'Muted', color: '#71717a' },
            { slug: 'accent', name: 'Accent', color: '#4f46e5' },
            { slug: 'border', name: 'Border', color: '#e4e4e7' },
          ],
        },
        typography: {
          fontFamilies: [
            { slug: 'sans', name: 'Sans', fontFamily: SANS },
            { slug: 'serif', name: 'Serif', fontFamily: SERIF },
          ],
        },
        layout: { contentSize: '44rem', wideSize: '72rem' },
      },
      styles: { fontFamily: 'sans', radius: 'medium' },
    },
    { list: 'list', entry: 'content', masthead: 'row' },
  ),
  theme(
    {
      id: 'editorial',
      name: 'Editorial',
      version: '2.0.0',
      description:
        'A warm, paper-toned reading layout with serif type, a centred masthead and a single focused column.',
      author: 'CMS',
      settings: {
        color: {
          palette: [
            { slug: 'base', name: 'Paper', color: '#fbf8f3' },
            { slug: 'surface', name: 'Surface', color: '#f3eee5' },
            { slug: 'contrast', name: 'Ink', color: '#1f1b16' },
            { slug: 'muted', name: 'Muted', color: '#6b6258' },
            { slug: 'accent', name: 'Rust', color: '#b4441c' },
            { slug: 'border', name: 'Border', color: '#e7dfd3' },
          ],
        },
        typography: {
          fontFamilies: [
            { slug: 'serif', name: 'Serif', fontFamily: SERIF },
            { slug: 'sans', name: 'Sans', fontFamily: SANS },
          ],
        },
        layout: { contentSize: '40rem', wideSize: '64rem' },
      },
      styles: {
        fontFamily: 'serif',
        fontSize: 'large',
        lineHeight: 'relaxed',
        radius: 'small',
      },
    },
    { list: 'list', entry: 'content', masthead: 'centered' },
  ),
  theme(
    {
      id: 'journal',
      name: 'Journal',
      version: '2.0.0',
      description:
        'A calm, dark slate design with clean sans-serif type and a wide card grid.',
      author: 'CMS',
      settings: {
        color: {
          palette: [
            { slug: 'base', name: 'Slate', color: '#0f172a' },
            { slug: 'surface', name: 'Surface', color: '#1e293b' },
            { slug: 'contrast', name: 'Text', color: '#e2e8f0' },
            { slug: 'muted', name: 'Muted', color: '#94a3b8' },
            { slug: 'accent', name: 'Sky', color: '#38bdf8' },
            { slug: 'border', name: 'Border', color: '#334155' },
          ],
        },
        typography: {
          fontFamilies: [{ slug: 'sans', name: 'Sans', fontFamily: SANS }],
        },
        layout: { contentSize: '46rem', wideSize: '76rem' },
      },
      styles: { fontFamily: 'sans', radius: 'large' },
    },
    { list: 'grid', entry: 'content', masthead: 'row' },
    '.cms-block-site-title { letter-spacing: -0.02em; }',
  ),
  MAGAZINE_THEME,
];
