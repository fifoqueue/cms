// Regression guard: when the API selects another locale for the site, everything the public
// layout shows follows it: the wrapper `lang`, dates, months, `og:locale` and JSON-LD.
import { afterAll, expect, setSystemTime, test } from 'bun:test';
import { SEO_SETTINGS_DEFAULTS } from '@cms/sdk';
import { fileURLToPath } from 'node:url';
import { compile, compileModule } from 'svelte/compiler';
import { scanDocumentRoutes } from '#lib/server/route-kinds.js';

Bun.plugin({
  name: 'sveltekit-ssr',
  setup(build) {
    build.module('$app/env/private', () => ({
      exports: {
        CMS_API_URL: 'http://cms.test',
        API_PORT: '4000',
        CMS_FRONTEND_SECRET: '',
        OIDC_FRONTEND_SECRET: '',
      },
      loader: 'object',
    }));
    // Route groups such as `/(site)` resolve to no path segment, as in SvelteKit.
    build.module('$app/paths', () => ({
      exports: {
        resolve: (path: string) => path.replace(/\/\([^)]*\)/g, '') || '/',
        match: async () => null,
      },
      loader: 'object',
    }));
    build.module('$app/state', () => ({
      exports: {
        page: {
          data: { kind: 'search', query: '', posts: null },
          url: new URL('http://web.test/search'),
          params: {},
        },
        navigating: { type: null },
      },
      loader: 'object',
    }));
    build.module('$app/navigation', () => ({
      exports: {
        afterNavigate: () => undefined,
        beforeNavigate: () => undefined,
        onNavigate: () => undefined,
        goto: async () => undefined,
      },
      loader: 'object',
    }));
    build.module('$app/environment', () => ({
      exports: { browser: false, dev: false, building: false },
      loader: 'object',
    }));
    build.module('virtual:cms/route-kinds', () => ({
      exports: {
        documents: scanDocumentRoutes(
          fileURLToPath(new URL('../src/routes', import.meta.url)),
        ),
      },
      loader: 'object',
    }));
    build.onLoad({ filter: /\.css$/ }, () => ({ contents: '', loader: 'js' }));
    build.onLoad({ filter: /\.svelte$/ }, async ({ path }) => ({
      contents: compile(await Bun.file(path).text(), {
        filename: path,
        generate: 'server',
      }).js.code,
      loader: 'js',
    }));
    build.onLoad({ filter: /\.svelte\.[jt]s$/ }, async ({ path }) => ({
      contents: compileModule(
        new Bun.Transpiler({ loader: 'ts' }).transformSync(
          await Bun.file(path).text(),
        ),
        { filename: path, generate: 'server' },
      ).js.code,
      loader: 'js',
    }));
  },
});

const { render } = await import('svelte/server');
const { load: loadServer } =
  await import('#web/routes/(site)/+layout.server.js');
const { load: loadUniversal } = await import('#web/routes/(site)/+layout.js');
const { siteTranslation } = await import('#lib/i18n/overrides.server.js');
const { default: SiteLayoutProbe } =
  await import('#web-test/fixtures/SiteLayoutProbe.svelte');

const theme = {
  id: 'paper',
  name: 'Paper',
  version: '1.0.0',
  settings: {
    palette: [
      ['base', '#ffffff'],
      ['surface', '#f5f5f5'],
      ['contrast', '#111111'],
      ['muted', '#666666'],
      ['accent', '#0055ff'],
      ['border', '#dddddd'],
    ].map(([slug, color]) => ({ slug, name: slug, color })),
    fontFamilies: [
      { slug: 'body', name: 'Body', fontFamily: 'Inter, sans-serif' },
    ],
    layout: { contentSize: '42rem', wideSize: '72rem' },
  },
  styles: {
    fontFamily: 'body',
    headingFontFamily: '',
    fontSize: 'medium',
    lineHeight: 'normal',
    radius: 'medium',
  },
  templates: { index: [] },
  parts: [],
  css: '',
  preview: false,
};

const reading = {
  frontPage: 'posts',
  frontPageId: null,
  postsPageId: null,
  postsPerPage: 10,
  feedItems: 20,
  dateFormat: 'long',
  timeZone: 'UTC',
  cacheSeconds: 0,
  frontPagePath: null,
  postsPagePath: null,
};

/** The API stand-in: an `en-US` site whose `i18n.locale` filter selects `ko`. */
const answering = (selected: string) => async (input: RequestInfo | URL) => {
  const url = new URL(input instanceof Request ? input.url : String(input));

  switch (url.pathname) {
    case '/api/v1/layout':
      return Response.json({
        site: { title: 'Site', description: '', locale: 'en-US' },
        seo: { ...SEO_SETTINGS_DEFAULTS, siteUrl: 'https://example.test' },
        theme,
        reading,
        menus: { primary: null, footer: null },
        widgets: { sidebar: [], footer: [] },
      });
    case '/api/v1/content':
      return Response.json({ items: [], total: 0, page: 1, pageSize: 20 });
    case '/api/v1/i18n/messages':
      return Response.json(
        { locale: selected, messages: {} },
        { headers: { etag: `"${selected}"` } },
      );
  }

  return Response.json(
    { error: { code: 'not_found', message: 'Not found' } },
    { status: 404 },
  );
};

// Translations are cached per process; later times keep this file's entries apart from others.
const start = Date.now();
const at = (hours: number) =>
  setSystemTime(new Date(start + hours * 3_600_000));

afterAll(async () => {
  at(2);
  await siteTranslation(answering('en') as typeof fetch, 'en-US');
  setSystemTime();
});

test('an API-selected locale drives the wrapper lang, dates, og:locale and JSON-LD', async () => {
  at(1);
  const locals = { token: null } as App.Locals;
  const server = await loadServer({
    fetch: answering('ko') as typeof fetch,
    cookies: { get: () => undefined, getAll: () => [] },
    locals,
  } as never);
  const data = await loadUniversal({ data: server } as never);
  const { head, body } = render(SiteLayoutProbe, {
    props: { data: data as never },
  });
  const og = /<meta property="og:locale" content="([^"]*)"/.exec(head)?.[1];
  const jsonLd = JSON.parse(
    /<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/.exec(
      head,
    )![1]!,
  ) as { '@graph': { inLanguage?: string }[] };

  expect(server).toMatchObject({
    displayLocale: 'ko',
    site: { locale: 'en-US' },
  });
  expect(locals.lang).toBe('ko');
  expect(body).toMatch(/class="cms-site[^"]*"[^>]*lang="ko"/);
  expect(body).toContain('<p data-probe="date">2026년 3월 1일</p>');
  expect(body).toContain('<p data-probe="month">2026년 3월</p>');
  expect(body).toContain('<p data-probe="language">ko</p>');
  // `ko` names no region, so the head carries no `og:locale` rather than the site's `en_US`.
  expect(og).toBeUndefined();
  expect(jsonLd['@graph'].flatMap((node) => node.inLanguage ?? [])).toEqual([
    'ko',
    'ko',
  ]);
  expect(head).not.toContain('en-US');
});
