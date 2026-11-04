// Regression guard: registered admin UI never takes a core screen down; failed, malformed and
// slow extension responses all degrade to the core UI.
import { expect, test } from 'bun:test';

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
  },
});

const { loadTerms } = await import('#lib/server/taxonomy-admin.js');
const { Errors } = await import('#lib/server/errors.js');
const { stylesAt } = await import('#lib/admin/admin-assets.js');

const {
  ADMIN_UI_ACTION_TIMEOUT_MS,
  ADMIN_UI_TIMEOUT_MS,
  runExtensionAction,
  SCREEN_PAGE_SIZE,
  pageOf,
  loadMenu,
  loadNotices,
  loadScreen,
  noExtensions,
  screenName,
} = await import('#lib/server/admin-ui.js');

test('screen names are the route ids the notice and asset registrations use', () => {
  expect(
    [
      '/admin/(app)',
      '/admin/(app)/content',
      '/admin/(app)/content/[id]',
      '/admin/(app)/tools/functions',
    ].map(screenName),
  ).toEqual(['dashboard', 'content', 'content/[id]', 'tools/functions']);
});

const locals = { token: 'token', user: null } as unknown as App.Locals;

const eventWith = (fetch: typeof globalThis.fetch) => ({ fetch, locals });

test('failed, malformed and slow extension calls fall back to the core UI', async () => {
  const failing = eventWith(async () =>
    Response.json({ error: 'boom' }, { status: 500 }),
  );
  const malformed = eventWith(async () =>
    Response.json({ items: [{ key: 'x', href: '//evil.example' }] }),
  );
  const hanging = eventWith(
    (_input, init) =>
      new Promise((_resolve, reject) =>
        init?.signal?.addEventListener('abort', () =>
          reject(init.signal!.reason),
        ),
      ),
  );

  expect(await loadMenu(failing)).toEqual([]);
  expect(await loadMenu(malformed)).toEqual([]);
  expect(await loadScreen(failing, 'content', ['a'])).toEqual(noExtensions());

  const started = Date.now();

  expect(await loadNotices(hanging, 'content')).toEqual([]);
  expect(Date.now() - started).toBeLessThan(ADMIN_UI_TIMEOUT_MS + 1000);
});

test('failed and hanging extension actions report every id as failed instead of throwing', async () => {
  const form = () => {
    const data = new FormData();

    data.set('action', 'ext:archive');
    data.append('ids', 'a');
    data.append('ids', 'b');

    return data;
  };
  const allFailed = {
    bulk: {
      done: 0,
      failed: [
        { id: 'a', message: Errors.BulkItemFailed },
        { id: 'b', message: Errors.BulkItemFailed },
      ],
    },
    extensionNotice: null,
  };
  const hanging = eventWith(
    (_input, init) =>
      new Promise((_resolve, reject) =>
        init?.signal?.addEventListener('abort', () =>
          reject(init.signal!.reason),
        ),
      ),
  );

  expect(
    await runExtensionAction(
      eventWith(async () => Response.json({ error: 'boom' }, { status: 500 })),
      'content',
      form(),
      () => true,
    ),
  ).toEqual(allFailed);

  const started = Date.now();

  expect(
    await runExtensionAction(hanging, 'content', form(), () => true),
  ).toEqual(allFailed);
  expect(Date.now() - started).toBeLessThan(ADMIN_UI_ACTION_TIMEOUT_MS + 1000);
});

test('whole lists show one screen-call page at a time, clamped to existing pages', () => {
  const ids = Array.from({ length: 250 }, (_, index) => `id-${index}`);
  const at = (page: string) =>
    pageOf(ids, new URLSearchParams(page && { page }));

  expect(at('').items).toEqual(ids.slice(0, SCREEN_PAGE_SIZE));
  expect(at('3').items).toEqual(ids.slice(200));
  expect(at('3').list).toEqual({ page: 3, total: 250, pageSize: 100 });
  expect(at('9').list.page).toBe(3);
  expect(at('-1').list.page).toBe(1);
  expect(at('x').list.page).toBe(1);
  expect(at('').items.length).toBeLessThanOrEqual(SCREEN_PAGE_SIZE);
});

test('stylesheets keep their placement', () => {
  const asset = (
    key: string,
    kind: 'style' | 'script',
    placement: 'head' | 'footer',
  ) => ({
    key,
    kind,
    src: `https://cdn.example/${key}`,
    placement,
    attrs: {},
  });
  const assets = [
    asset('top', 'style', 'head'),
    asset('bottom', 'style', 'footer'),
    asset('code', 'script', 'footer'),
  ];

  expect(stylesAt(assets, 'head').map(({ key }) => key)).toEqual(['top']);
  expect(stylesAt(assets, 'footer').map(({ key }) => key)).toEqual(['bottom']);
});

test('term screens forward only bounded `filter.<key>` values to the list query', async () => {
  const url = new URL('http://web.test/admin/tags');

  url.searchParams.set('filter.example:group', 'staff');
  url.searchParams.set('filter.empty', '');
  url.searchParams.set('filter.bad key', 'x');
  url.searchParams.set('filter.long', 'x'.repeat(201));
  url.searchParams.set('q', 'core');

  const requests: URL[] = [];

  // Every API call fails, so the load rejects after the term list request was sent.
  await loadTerms(
    {
      fetch: async (input) => {
        requests.push(new URL(input instanceof Request ? input.url : input));

        return Response.json({}, { status: 500 });
      },
      locals,
      request: new Request(url),
      url,
    },
    'tag',
  ).catch(() => undefined);

  const list = requests.find(({ pathname }) =>
    pathname.startsWith('/api/v1/admin/taxonomies/tag'),
  );

  expect(Object.fromEntries(list!.searchParams)).toEqual({
    'filter.example:group': 'staff',
  });
});

test('screen extensions keep only the listed rows and declared fields', async () => {
  const event = eventWith(async () =>
    Response.json({
      columns: [{ key: 'words', label: 'Words' }],
      values: { a: { words: '12' }, other: { words: '99' } },
      rowActions: [],
      bulkActions: [{ key: 'archive', label: 'Archive' }],
      filters: [],
    }),
  );

  expect(await loadScreen(event, 'content', ['a'])).toEqual({
    columns: [{ key: 'words', label: 'Words' }],
    values: { a: { words: '12' } },
    rowActions: [],
    bulkActions: [{ key: 'archive', label: 'Archive' }],
    filters: [],
  });
});
