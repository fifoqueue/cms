// Regression guard for plugin-provided templates and parts in the site editor: they stay
// read-only until the administrator customizes them, and customizing saves the administrator's
// own copy through the customization endpoint. Fake API responses only.
import { beforeEach, describe, expect, test } from 'bun:test';
import { isActionFailure, isRedirect } from '@sveltejs/kit';

Bun.plugin({
  name: 'sveltekit-env',
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
    build.module('$app/paths', () => ({
      exports: { resolve: (path: string) => path, match: async () => null },
      loader: 'object',
    }));
  },
});

const { actions } =
  await import('#web/routes/admin/(app)/appearance/editor/+page.server.js');

const PLUGIN_BLOCKS = [{ name: 'site-title' }];
const settings = {
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
};
const styles = {
  fontFamily: 'body',
  headingFontFamily: '',
  fontSize: 'medium',
  lineHeight: 'normal',
  radius: 'medium',
};
const editor = {
  id: 'paper',
  name: 'Paper',
  settings,
  styles: { theme: styles, current: styles, colors: {}, customized: false },
  templates: [
    { name: 'index', blocks: [], inTheme: true, customized: false },
    {
      name: 'single-event',
      source: 'events',
      readOnly: true,
      blocks: PLUGIN_BLOCKS,
      inTheme: false,
      customized: false,
    },
  ],
  parts: [
    {
      slug: 'event-banner',
      title: 'Event banner',
      area: 'uncategorized',
      source: 'events',
      readOnly: true,
      blocks: PLUGIN_BLOCKS,
      inTheme: false,
      customized: false,
    },
  ],
};

let writes: { method: string; path: string; body: unknown }[] = [];
const fakeFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const request = new Request(input, init);
  const url = new URL(request.url);
  if (request.method === 'GET' && url.pathname.endsWith('/editor'))
    return Response.json(editor);
  const text = await request.text();
  writes.push({
    method: request.method,
    path: url.pathname,
    body: text ? JSON.parse(text) : null,
  });
  return new Response(null, { status: 204 });
}) as typeof fetch;

const event = (action: string, form: Record<string, string>) => {
  const body = new FormData();
  for (const [key, value] of Object.entries(form)) body.set(key, value);
  const url = new URL(`/admin/appearance/editor?/${action}`, 'http://web.test');
  return {
    fetch: fakeFetch,
    url,
    params: {},
    setHeaders: () => undefined,
    request: new Request(url, { method: 'POST', body }),
    locals: { token: 'token', user: { id: 'u1' } },
  } as never;
};

const redirectOf = async (run: () => Promise<unknown>) => {
  try {
    await run();
  } catch (caught) {
    if (isRedirect(caught)) return caught.location;
    throw caught;
  }
  throw new Error('expected a redirect');
};

beforeEach(() => {
  writes = [];
});

describe('plugin templates and parts', () => {
  test('saving a read-only plugin template or part is refused without writing', async () => {
    const template = await actions.saveTemplate(
      event('saveTemplate', {
        theme: 'paper',
        name: 'single-event',
        blocks: '[]',
      }),
    );
    const part = await actions.savePart(
      event('savePart', { theme: 'paper', slug: 'event-banner', blocks: '[]' }),
    );
    for (const result of [template, part]) {
      expect(isActionFailure(result)).toBe(true);
      expect((result as { status: number }).status).toBe(409);
    }
    expect(writes).toEqual([]);
  });

  test('customizing saves the plugin version as the administrator’s own copy', async () => {
    expect(
      await redirectOf(() =>
        actions.customize(
          event('customize', {
            theme: 'paper',
            kind: 'template',
            key: 'single-event',
          }),
        ),
      ),
    ).toBe('?theme=paper&edit=template%3Asingle-event');
    expect(
      await redirectOf(() =>
        actions.customize(
          event('customize', {
            theme: 'paper',
            kind: 'part',
            key: 'event-banner',
          }),
        ),
      ),
    ).toBe('?theme=paper&edit=part%3Aevent-banner');
    // The SDK fills block defaults; the copy is the plugin's blocks.
    expect(writes).toMatchObject([
      {
        method: 'PUT',
        path: '/api/v1/admin/themes/paper/templates/single-event',
        body: { blocks: PLUGIN_BLOCKS },
      },
      {
        method: 'PUT',
        path: '/api/v1/admin/themes/paper/parts/event-banner',
        body: { blocks: PLUGIN_BLOCKS },
      },
    ]);
  });

  test('editable templates still save normally', async () => {
    const result = await actions.saveTemplate(
      event('saveTemplate', { theme: 'paper', name: 'index', blocks: '[]' }),
    );
    expect(result).toEqual({ notice: 'saved' });
    expect(writes).toEqual([
      {
        method: 'PUT',
        path: '/api/v1/admin/themes/paper/templates/index',
        body: { blocks: [] },
      },
    ]);
  });
});
