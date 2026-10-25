import { themePackageSchema } from '@cms/sdk';
import type { BlockInput, ThemePackage, ThemePackageInput } from '@cms/sdk';
import { block, part, SANS, SERIF } from '#api/domain/theme/theme-blocks';

/**
 * Canvas: a clean, bright layout with a title row header, post lists, a sidebar column when
 * widgets exist and centred single entries.
 */

const header: BlockInput[] = [
  block(
    'group',
    {
      tagName: 'header',
      width: 'wide',
      padding: 'medium',
      border: 'bottom',
      background: 'base',
    },
    [
      block('group', { layout: 'flex', justify: 'between', gap: 'medium' }, [
        block('group', { layout: 'flex', gap: 'small', wrap: false }, [
          block('site-logo', { width: 40 }),
          block('group', { layout: 'stack', gap: 'none', align: 'start' }, [
            block('site-title'),
            block('site-tagline'),
          ]),
        ]),
        block('group', { layout: 'flex', gap: 'medium', wrap: false }, [
          block('navigation'),
          block('search'),
          block('loginout'),
        ]),
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

/** One post in a list: meta, title, image, excerpt, tags. */
const card = block('post-template', {}, [
  block('post-meta'),
  block('post-title', { level: 2, link: true, size: 'large' }),
  block('post-featured-image', { aspect: 'wide' }),
  block('post-excerpt', { moreLink: true }),
  block('post-terms', { taxonomy: 'tag' }),
]);

/** Search results follow the same list layout as the home page. */
const loop = block('query', { layout: 'list', divider: true }, [
  card,
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

const page = (main: BlockInput[], width: 'content' | 'wide') => [
  part('header'),
  withSidebar(main, width),
  part('footer'),
];

const templates: Record<string, BlockInput[]> = {
  index: page([block('query-title'), loop], 'wide'),
  home: page([block('query-title'), block('content-type-nav'), loop], 'wide'),
  search: page(
    [block('query-title'), block('search', { showLabel: true }), loop],
    'wide',
  ),
  single: page(
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
    'content',
  ),
  page: page(
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
    [block('query-title'), block('search', { showLabel: true })],
    'content',
  ),
};

export const canvasTheme = (id: string): ThemePackage =>
  themePackageSchema.parse({
    manifest: {
      id,
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
      templateParts: [
        { slug: 'header', title: 'Header', area: 'header' },
        { slug: 'footer', title: 'Footer', area: 'footer' },
      ],
    },
    templates,
    parts: { header, footer },
    css: '',
  } satisfies ThemePackageInput);
