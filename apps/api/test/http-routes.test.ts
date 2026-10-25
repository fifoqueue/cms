import { describe, expect, test } from 'bun:test';
import { DashboardPreferencesService } from '#api/domain/dashboard/dashboard-preferences';
import { createApiApp } from '#api/http/app';
import type { ApiServices } from '#api/http/services';
import { ClientResolver } from '#api/http/client-identity';
import { conflict, expiredSignIn } from '#api/shared/errors';
import { MemorySettings, profile } from '#test/support/memory';

const TOKEN = 'admin-token';
test('extension discovery routes enforce permissions and preserve source', async () => {
  for (const path of [
    'patterns/contributions',
    'capabilities',
    'menus/types',
    'menus/objects?type=examples&search=One&pageSize=1',
  ]) {
    const url = `http://localhost/api/v1/admin/${path}`;
    expect((await app.handle(new Request(url))).status).toBe(401);
    const response = await app.handle(
      new Request(url, { headers: { authorization: `Bearer ${TOKEN}` } }),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    if (!path.startsWith('menus/objects'))
      expect(body[0].source).toBe('example');
    else expect(body.items[0].id).toBe('one');
  }
  for (const path of [
    'capabilities',
    'menus/types',
    'menus/objects?type=examples',
  ]) {
    expect(
      (
        await app.handle(
          new Request(`http://localhost/api/v1/admin/${path}`, {
            headers: { authorization: `Bearer ${WRITER}` },
          }),
        )
      ).status,
    ).toBe(403);
  }
});
const user = profile({ id: 'u1', email: 'a@example.com', name: 'Admin' });

/** Accounts with one side of the Writing settings permissions. */
const WRITER = 'writer-token';
const OPERATOR = 'operator-token';
const accounts: Record<string, typeof user> = {
  [TOKEN]: user,
  [WRITER]: profile({ id: 'w1', role: 'contributor' }),
  [OPERATOR]: profile({
    id: 'o1',
    role: 'settings-operator',
    capabilities: ['settings.manage'],
  }),
};

const auth = {
  authenticate: async (token: string) => accounts[token] ?? null,
  status: async () => ({ setupRequired: false }),
  login: async (input: unknown) => ({ token: TOKEN, input }),
  logout: async () => {},
  requireRecent: async () => {},
} as unknown as ApiServices['auth'];

const calls: unknown[][] = [];

const record =
  (name: string, result: unknown = { ok: true }) =>
  async (...args: unknown[]) => {
    calls.push([name, ...args]);

    return result;
  };

const errors: unknown[][] = [];

const app = await createApiApp({
  services: {
    privacy: {
      publicSettings: async () => ({ policy: null, commentCookies: true }),
    } as ApiServices['privacy'],
    auth,
    recovery: {} as ApiServices['recovery'],
    sso: {
      info: () => ({ enabled: false }),
      unlink: record('sso.unlink'),
    } as unknown as ApiServices['sso'],
    clients: new ClientResolver(undefined),
    site: { get: record('site.get') } as unknown as ApiServices['site'],
    seo: {
      getPublic: record('seo.public'),
      getAdmin: record('seo.admin'),
      update: record('seo.update'),
    } as unknown as ApiServices['seo'],
    seoFilter: {} as ApiServices['seoFilter'],
    seoDiscovery: {
      list: record('seo.discovery'),
    } as unknown as ApiServices['seoDiscovery'],
    permalinks: {
      get: record('permalinks.get'),
      update: record('permalinks.update'),
    } as unknown as ApiServices['permalinks'],
    permalinkResolver: {
      resolve: record('permalinks.resolve'),
    } as unknown as ApiServices['permalinkResolver'],
    publicTaxonomy: {
      list: record('taxonomy.public.list', []),
      getBySlug: record('taxonomy.public.get'),
    } as unknown as ApiServices['publicTaxonomy'],
    adminTaxonomy: {
      list: record('taxonomy.admin.list', []),
      create: record('taxonomy.admin.create'),
      update: record('taxonomy.admin.update'),
      remove: record('taxonomy.admin.remove'),
    } as unknown as ApiServices['adminTaxonomy'],
    themes: {
      getPublic: record('themes.public'),
      list: record('themes.list', []),
      install: record('themes.install'),
      activate: record('themes.activate'),
      remove: record('themes.remove'),
      editor: record('themes.editor'),
      saveTemplate: record('themes.saveTemplate'),
      resetTemplate: record('themes.resetTemplate'),
      savePart: record('themes.savePart'),
      resetPart: record('themes.resetPart'),
      saveStyles: record('themes.saveStyles'),
      resetStyles: record('themes.resetStyles'),
    } as unknown as ApiServices['themes'],
    publicContent: {
      list: record('public.list'),
      getBySlug: async (slug: string) => {
        if (slug === 'taken') throw conflict('slug taken');

        if (slug === 'boom') throw new Error('secret failure');

        return { slug };
      },
    } as unknown as ApiServices['publicContent'],
    slots: { render: record('slots') } as unknown as ApiServices['slots'],
    adminContent: {
      list: record('admin.list'),
      create: record('admin.create'),
      get: record('admin.get'),
      update: record('admin.update'),
      remove: record('admin.remove'),
    } as unknown as ApiServices['adminContent'],
    users: {
      list: record('users.list', []),
    } as unknown as ApiServices['users'],
    roles: {
      capabilityDefinitions: () => [
        { key: 'example.read', label: 'Read', source: 'example' },
      ],
    } as ApiServices['roles'],
    archivePaths: {} as ApiServices['archivePaths'],
    taxonomyTypes: {} as ApiServices['taxonomyTypes'],
    passwords: {} as ApiServices['passwords'],
    contentRevisions: {} as ApiServices['contentRevisions'],
    previews: {} as ApiServices['previews'],
    media: {} as ApiServices['media'],
    reading: {} as ApiServices['reading'],
    writing: {
      get: record('writing.get'),
      update: record('writing.update'),
    } as unknown as ApiServices['writing'],
    dashboardPreferences: new DashboardPreferencesService(new MemorySettings()),
    patterns: {
      contributions: record('patterns.contributions', [
        { key: 'examples', source: 'example', patterns: [] },
      ]),
      update: record('patterns.update'),
    } as unknown as ApiServices['patterns'],
    menus: {
      types: () => [
        {
          key: 'examples',
          label: 'Examples',
          source: 'example',
          searchable: true,
        },
      ],
      objects: record('menus.objects', {
        items: [{ id: 'one', label: 'One' }],
        total: 1,
      }),
    } as unknown as ApiServices['menus'],
    widgets: {} as ApiServices['widgets'],
    comments: {} as ApiServices['comments'],
    avatars: {} as ApiServices['avatars'],
    search: {} as ApiServices['search'],
    pluginPages: {} as ApiServices['pluginPages'],
    pluginBlocks: {} as ApiServices['pluginBlocks'],
    dashboardWidgets: {} as ApiServices['dashboardWidgets'],
    webhooks: {} as ApiServices['webhooks'],
    siteHealth: {} as ApiServices['siteHealth'],
    ssoSettings: {} as ApiServices['ssoSettings'],
    signIn: {
      info: record('signIn.info', {
        methods: [],
        setup: [],
        passwordReset: false,
      }),
      start: record('signIn.start'),
      setup: record('signIn.setup'),
      continue: async (input: unknown, ...args: unknown[]) => {
        if ((input as { transaction?: string }).transaction === 'expired')
          throw expiredSignIn();
        return record('signIn.continue', { kind: 'done' })(input, ...args);
      },
      chooseFactor: async (input: unknown, ...args: unknown[]) => {
        if ((input as { transaction?: string }).transaction === 'expired')
          throw expiredSignIn();
        return record('signIn.chooseFactor')(input, ...args);
      },
      factors: record('signIn.factors'),
      enroll: record('signIn.enroll'),
      removeFactor: record('signIn.removeFactor'),
    } as unknown as ApiServices['signIn'],
    signInSettings: {
      getAdmin: record('signIn.getAdmin'),
      update: record('signIn.update'),
    } as unknown as ApiServices['signInSettings'],
    frontendSecret: 'test-frontend-secret',
    themePreviews: {} as ApiServices['themePreviews'],
    importer: {} as ApiServices['importer'],
    exporter: {} as ApiServices['exporter'],
    contentTypes: {
      update: record('contentTypes.update'),
    } as unknown as ApiServices['contentTypes'],
    fields: {
      update: record('fields.update'),
    } as unknown as ApiServices['fields'],
    apiTokens: {} as ApiServices['apiTokens'],
    security: {} as ApiServices['security'],
    egress: {} as ApiServices['egress'],
    email: {} as ApiServices['email'],
    plugins: {
      list: record('plugins.list', []),
      install: record('plugins.install'),
      enable: record('plugins.enable'),
    } as unknown as ApiServices['plugins'],
    pluginGateway: {
      handle: async (id: string) => Response.json({ gateway: id }),
    } as unknown as ApiServices['pluginGateway'],
  },
  logger: {
    info: () => {},
    warn: () => {},
    error: (...args: unknown[]) => errors.push(args),
  },
});
const call = (
  method: string,
  path: string,
  init: { token?: string; body?: string; type?: string } = {},
) =>
  app.fetch(
    new Request(`http://localhost${path}`, {
      method,
      body: init.body,
      headers: {
        ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
        ...(init.type ? { 'content-type': init.type } : {}),
      },
    }),
  );

describe('API route compatibility', () => {
  const bodyRoutes = [
    ['/api/v1/admin/seo', 'seo.update', [], 200, 512 * 1024, false],
    [
      '/api/v1/admin/themes/t/styles',
      'themes.saveStyles',
      ['t'],
      204,
      512 * 1024,
      false,
    ],
    [
      '/api/v1/admin/themes/t/parts/header',
      'themes.savePart',
      ['t', 'header'],
      204,
      512 * 1024,
      false,
    ],
    [
      '/api/v1/admin/themes/t/templates/index',
      'themes.saveTemplate',
      ['t', 'index'],
      204,
      512 * 1024,
      false,
    ],
    ['/api/v1/admin/content/1', 'admin.update', ['1'], 200, 1024 * 1024, true],
    [
      '/api/v1/admin/patterns/1',
      'patterns.update',
      ['1'],
      200,
      1024 * 1024,
      true,
    ],
    [
      '/api/v1/admin/content-types/post',
      'contentTypes.update',
      ['post'],
      200,
      512 * 1024,
      true,
    ],
    [
      '/api/v1/admin/fields/custom',
      'fields.update',
      ['custom'],
      200,
      512 * 1024,
      true,
    ],
  ] as const;

  for (const [path, method, args, status, limit, actor] of bodyRoutes) {
    test(`manual JSON parsing and byte limits: ${path}`, async () => {
      calls.length = 0;
      const input = { value: 'valid' };
      const send = (body: string) =>
        call('PUT', path, {
          token: TOKEN,
          type: 'application/json',
          body,
        });
      expect((await send(JSON.stringify(input))).status).toBe(status);
      expect(calls).toEqual([
        [method, ...args, input, ...(actor ? [user] : [])],
      ]);
      calls.length = 0;
      const malformed = await send('{');
      expect(malformed.status).toBe(400);
      expect(await malformed.json()).toMatchObject({
        error: { code: 'invalid_input', message: 'Request body must be JSON' },
      });
      expect(calls).toEqual([]);
      // ASCII JSON quotes add two bytes, so these straddle the exact boundary.
      expect((await send(JSON.stringify('x'.repeat(limit - 2)))).status).toBe(
        status,
      );
      calls.length = 0;
      expect((await send(JSON.stringify('x'.repeat(limit - 1)))).status).toBe(
        413,
      );
      expect(calls).toEqual([]);
    });
  }

  test('theme reset ignores junk JSON bodies', async () => {
    for (const [path, method, args] of [
      ['/api/v1/admin/themes/t/styles', 'themes.resetStyles', ['t']],
      [
        '/api/v1/admin/themes/t/parts/header',
        'themes.resetPart',
        ['t', 'header'],
      ],
      [
        '/api/v1/admin/themes/t/templates/index',
        'themes.resetTemplate',
        ['t', 'index'],
      ],
    ] as const) {
      calls.length = 0;
      const response = await call('DELETE', path, {
        token: TOKEN,
        type: 'application/json',
        body: '{',
      });
      expect(response.status).toBe(204);
      expect(calls).toEqual([[method, ...args]]);
    }
  });

  test('static, dynamic and query routes keep their paths and inputs', async () => {
    expect(await (await call('GET', '/api/health')).json()).toEqual({
      status: 'ok',
    });
    expect(await (await call('GET', '/api/v1/content/hello')).json()).toEqual({
      slug: 'hello',
    });
    expect(
      await (await call('GET', '/api/v1/content/caf%C3%A9')).json(),
    ).toEqual({ slug: 'café' });
    calls.length = 0;
    await call('GET', '/api/v1/content?type=post&page=2');
    await call('GET', '/api/v1/slots?path=%2Fa&contentId=7');
    expect(calls).toEqual([
      ['public.list', { type: 'post', page: '2' }],
      ['slots', { path: '/a', contentId: '7' }],
    ]);
  });

  test('authenticated permalink responses carry the verified actor and cannot be cached', async () => {
    calls.length = 0;
    const response = await call('GET', '/api/v1/resolve?path=%2Fprivate', {
      token: TOKEN,
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(calls).toEqual([
      ['permalinks.resolve', { path: '/private' }, [], user],
    ]);
  });

  test('unknown paths and methods return the API error body', async () => {
    for (const [method, path] of [
      ['GET', '/nope'],
      ['POST', '/api/health'],
      ['GET', '/api/v1/content/a/b'],
    ] as const) {
      const response = await call(method, path);
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({
        error: { code: 'not_found', message: 'Route not found' },
      });
    }
  });

  test('sign-in settings require settings.manage and pass the authenticated actor', async () => {
    for (const method of ['GET', 'PUT']) {
      expect((await call(method, '/api/v1/admin/sign-in')).status).toBe(401);
      expect(
        (await call(method, '/api/v1/admin/sign-in', { token: WRITER })).status,
      ).toBe(403);
    }
    calls.length = 0;
    expect(
      (await call('GET', '/api/v1/admin/sign-in', { token: OPERATOR })).status,
    ).toBe(200);
    expect(calls).toEqual([['signIn.getAdmin']]);
    calls.length = 0;
    const policy = {
      methods: ['password'],
      secondFactors: [],
      requireSecondFactor: [],
    };
    expect(
      (
        await call('PUT', '/api/v1/admin/sign-in', {
          token: OPERATOR,
          type: 'application/json',
          body: JSON.stringify(policy),
        })
      ).status,
    ).toBe(200);
    expect(calls).toEqual([['signIn.update', policy, accounts[OPERATOR]]]);
  });

  test('expired sign-in handles have one restart status and SDK message', async () => {
    for (const path of [
      '/api/v1/auth/sign-in/continue',
      '/api/v1/auth/sign-in/factor',
    ]) {
      const response = await call('POST', path, {
        type: 'application/json',
        body: JSON.stringify({ transaction: 'expired' }),
      });
      expect(response.status).toBe(410);
      expect(response.headers.get('cache-control')).toBe('private, no-store');
      expect(await response.json()).toMatchObject({
        error: {
          code: 'sign_in_expired',
          message: 'This sign-in request is no longer valid. Start again.',
        },
      });
    }
  });

  test('step-based sign-in routes dispatch bounded JSON and optional actor without caching', async () => {
    const visitor = { client: null, address: null, captchaToken: null };
    calls.length = 0;
    const info = await call('GET', '/api/v1/auth/sign-in');
    expect(info.status).toBe(200);
    expect(info.headers.get('cache-control')).toBe('private, no-store');
    expect(calls).toEqual([['signIn.info']]);
    const body = { transaction: 'handle', values: { code: '123456' } };
    for (const [path, name, prefix, suffix] of [
      [
        '/api/v1/auth/sign-in/plugin%3Atest%3Amethod',
        'signIn.start',
        ['plugin:test:method'],
        [],
      ],
      [
        '/api/v1/auth/sign-in/setup/plugin%3Atest%3Amethod',
        'signIn.setup',
        ['plugin:test:method'],
        [],
      ],
      ['/api/v1/auth/sign-in/continue', 'signIn.continue', [], [undefined]],
      ['/api/v1/auth/sign-in/factor', 'signIn.chooseFactor', [], []],
    ] as const) {
      calls.length = 0;
      const response = await call('POST', path, {
        body: JSON.stringify(body),
        type: 'application/json',
      });
      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toBe('private, no-store');
      expect(calls).toEqual([[name, ...prefix, body, visitor, ...suffix]]);
      expect(
        (await call('POST', path, { body: '{', type: 'application/json' }))
          .status,
      ).toBe(400);
      expect(
        (
          await call('POST', path, {
            body: JSON.stringify({ values: { code: 'a'.repeat(32 * 1024) } }),
            type: 'application/json',
          })
        ).status,
      ).toBe(413);
    }
    calls.length = 0;
    await call('POST', '/api/v1/auth/sign-in/continue', {
      token: WRITER,
      type: 'application/json',
      body: JSON.stringify(body),
    });
    expect(calls).toEqual([
      ['signIn.continue', body, visitor, accounts[WRITER]],
    ]);
  });

  test('account factor routes require a user, not administrator capability', async () => {
    for (const [method, path] of [
      ['GET', '/api/v1/auth/factors'],
      ['POST', '/api/v1/auth/factors/plugin%3Atest%3Afactor/enroll'],
      ['DELETE', '/api/v1/auth/factors/plugin%3Atest%3Afactor/credential'],
    ])
      expect((await call(method!, path!)).status).toBe(401);
    calls.length = 0;
    expect(
      (await call('GET', '/api/v1/auth/factors', { token: WRITER })).status,
    ).toBe(200);
    expect(
      (
        await call(
          'POST',
          '/api/v1/auth/factors/plugin%3Atest%3Afactor/enroll',
          { token: WRITER },
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await call(
          'DELETE',
          '/api/v1/auth/factors/plugin%3Atest%3Afactor/credential',
          { token: WRITER },
        )
      ).status,
    ).toBe(204);
    expect(calls).toEqual([
      ['signIn.factors', accounts[WRITER]],
      [
        'signIn.enroll',
        accounts[WRITER],
        'plugin:test:factor',
        { client: null, address: null, captchaToken: null },
      ],
      [
        'signIn.removeFactor',
        accounts[WRITER],
        'plugin:test:factor',
        'credential',
      ],
    ]);
  });

  test('domain errors map to statuses and unexpected errors stay hidden', async () => {
    const conflicted = await call('GET', '/api/v1/content/taken');
    expect(conflicted.status).toBe(409);
    expect(await conflicted.json()).toMatchObject({
      error: { code: 'conflict' },
    });

    const crashed = await call('GET', '/api/v1/content/boom');
    expect(crashed.status).toBe(500);
    const text = await crashed.text();
    expect(text).toContain('internal');
    expect(text).not.toContain('secret failure');
    expect(errors).toHaveLength(1);
  });

  test('a session guard covers only the routes after it', async () => {
    expect((await call('GET', '/api/v1/auth/status')).status).toBe(200);
    expect((await call('GET', '/api/v1/auth/me')).status).toBe(401);
    expect(
      (await call('GET', '/api/v1/auth/me', { token: 'bad' })).status,
    ).toBe(401);
    expect(
      await (await call('GET', '/api/v1/auth/me', { token: TOKEN })).json(),
    ).toEqual(user);
    expect((await call('GET', '/api/v1/content')).status).toBe(200);
  });

  test('admin routes require a session and read the JSON body themselves', async () => {
    for (const [method, path] of [
      ['GET', '/api/v1/admin/content'],
      ['POST', '/api/v1/admin/content'],
      ['GET', '/api/v1/admin/content/1'],
      ['PUT', '/api/v1/admin/content/1'],
      ['DELETE', '/api/v1/admin/content/1'],
      ['GET', '/api/v1/admin/plugins'],
      ['POST', '/api/v1/admin/plugins/x/enable'],
      ['GET', '/api/v1/admin/taxonomies/category'],
      ['POST', '/api/v1/admin/taxonomies/tag'],
      ['PUT', '/api/v1/admin/taxonomies/category/1'],
      ['DELETE', '/api/v1/admin/taxonomies/tag/1'],
      ['GET', '/api/v1/admin/themes'],
      ['GET', '/api/v1/admin/seo'],
      ['PUT', '/api/v1/admin/seo'],
      ['GET', '/api/v1/admin/permalinks'],
      ['PUT', '/api/v1/admin/permalinks'],
      ['POST', '/api/v1/admin/themes'],
      ['POST', '/api/v1/admin/themes/editorial/activate'],
      ['DELETE', '/api/v1/admin/themes/custom'],
      ['GET', '/api/v1/admin/themes/custom/editor'],
      ['PUT', '/api/v1/admin/themes/custom/templates/index'],
      ['DELETE', '/api/v1/admin/themes/custom/parts/header'],
      ['PUT', '/api/v1/admin/themes/custom/styles'],
    ] as const)
      expect((await call(method, path)).status).toBe(401);

    calls.length = 0;
    const created = await call('POST', '/api/v1/admin/content', {
      token: TOKEN,
      type: 'application/json',
      body: JSON.stringify({ title: 'Hi' }),
    });
    expect(created.status).toBe(201);
    await call('PUT', '/api/v1/admin/content/abc', {
      token: TOKEN,
      type: 'application/json',
      body: JSON.stringify({ title: 'Yo' }),
    });
    expect(
      (await call('DELETE', '/api/v1/admin/content/abc', { token: TOKEN }))
        .status,
    ).toBe(204);
    await call('GET', '/api/v1/admin/content?page=3', { token: TOKEN });
    await call('POST', '/api/v1/admin/plugins/p-1/enable', { token: TOKEN });
    expect(calls).toEqual([
      ['admin.create', { title: 'Hi' }, user],
      ['admin.update', 'abc', { title: 'Yo' }, user],
      ['admin.remove', 'abc', user],
      ['admin.list', { page: '3' }, user],
      ['plugins.enable', 'p-1'],
    ]);
  });

  test('dashboard preferences belong only to the authenticated writer across requests', async () => {
    const path = '/api/v1/admin/dashboard-preferences';
    const layout = { order: ['draft', 'activity'], hidden: ['activity'] };
    for (const method of ['GET', 'PUT']) {
      expect((await call(method, path)).status).toBe(401);
      expect((await call(method, path, { token: OPERATOR })).status).toBe(403);
    }
    const saved = await call('PUT', path, {
      token: WRITER,
      type: 'application/json',
      body: JSON.stringify(layout),
    });
    expect(saved.status).toBe(200);
    expect(await saved.json()).toEqual(layout);
    expect(await (await call('GET', path, { token: TOKEN })).json()).toEqual({
      order: [],
      hidden: [],
    });
    const spoofed = await call('PUT', path, {
      token: TOKEN,
      type: 'application/json',
      body: JSON.stringify({ ...layout, userId: accounts[WRITER]!.id }),
    });
    expect(spoofed.status).toBe(400);
    expect(await (await call('GET', path, { token: TOKEN })).json()).toEqual({
      order: [],
      hidden: [],
    });
    const restored = await call('GET', path, { token: WRITER });
    expect(restored.headers.get('cache-control')).toBe('private, no-store');
    expect(await restored.json()).toEqual(layout);
  });

  test('dashboard layouts larger than a cookie persist; oversized settings never overwrite them', async () => {
    const path = '/api/v1/admin/dashboard-preferences';
    const order = Array.from(
      { length: 15 },
      (_, index) =>
        `plugin:${'p'.repeat(64)}:${'w'.repeat(62)}${String(index).padStart(2, '0')}`,
    );
    const layout = { order, hidden: order };
    expect(encodeURIComponent(JSON.stringify(layout)).length).toBeGreaterThan(
      4096,
    );
    const put = (input: unknown) =>
      call('PUT', path, {
        token: TOKEN,
        type: 'application/json',
        body: JSON.stringify(input),
      });
    expect((await put(layout)).status).toBe(200);
    for (const input of [
      { ...layout, order: Array(101).fill('draft') },
      { ...layout, hidden: Array(101).fill('draft') },
      { ...layout, order: ['w'.repeat(201)] },
      { ...layout, hidden: [null] },
    ])
      expect((await put(input)).status).toBe(400);
    expect(await (await call('GET', path, { token: TOKEN })).json()).toEqual(
      layout,
    );
  });

  test('Writing settings: writers read them, settings operators change them', async () => {
    const put = (token: string) =>
      call('PUT', '/api/v1/admin/writing', {
        token,
        type: 'application/json',
        body: JSON.stringify({ defaultStatus: 'draft' }),
      });
    expect(
      (await call('GET', '/api/v1/admin/writing', { token: WRITER })).status,
    ).toBe(200);
    expect((await put(WRITER)).status).toBe(403);
    expect(
      (await call('GET', '/api/v1/admin/writing', { token: OPERATOR })).status,
    ).toBe(403);
    expect((await put(OPERATOR)).status).toBe(200);
  });

  test('malformed JSON is invalid input and bundle uploads arrive as raw text', async () => {
    const malformed = await call('POST', '/api/v1/auth/login', {
      body: '{',
      type: 'application/json',
    });
    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toMatchObject({
      error: { code: 'invalid_input' },
    });
    calls.length = 0;
    const source = 'export const plugin = {};\n';
    for (const type of ['text/javascript', 'application/json'])
      expect(
        (
          await call('POST', '/api/v1/admin/plugins', {
            token: TOKEN,
            type,
            body: source,
          })
        ).status,
      ).toBe(201);
    expect(calls).toEqual([
      ['plugins.install', source],
      ['plugins.install', source],
    ]);
    const empty = await call('POST', '/api/v1/admin/plugins', {
      token: TOKEN,
      body: '  ',
    });
    expect(empty.status).toBe(400);
  });

  test('small public endpoints stop oversized bodies before JSON parsing', async () => {
    const response = await call('POST', '/api/v1/auth/login', {
      body: JSON.stringify({ padding: 'x'.repeat(33 * 1024) }),
      type: 'application/json',
    });

    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({
      error: { message: 'Request body is too large' },
    });
  });

  test('extension upload limits count UTF-8 bytes rather than characters', async () => {
    calls.length = 0;

    const response = await call('POST', '/api/v1/admin/plugins', {
      token: TOKEN,
      type: 'text/javascript',
      body: '가'.repeat(2 * 1024 * 1024),
    });

    expect(response.status).toBe(413);
    expect(
      (
        await call('POST', '/api/v1/admin/themes', {
          token: TOKEN,
          type: 'application/zip',
          body: '가'.repeat(700_000),
        })
      ).status,
    ).toBe(400);
    expect(calls).toEqual([]);
  });
});

describe('file-based routes', () => {
  test('route files map to their URLs, including SSO and the plugin gateway', async () => {
    expect(await (await call('GET', '/api/v1/auth/sso')).json()).toEqual({
      enabled: false,
    });
    expect(
      (await call('DELETE', '/api/v1/auth/sso/identity/identity-1')).status,
    ).toBe(401);
    expect(
      (
        await call('DELETE', '/api/v1/auth/sso/identity/identity-1', {
          token: TOKEN,
        })
      ).status,
    ).toBe(204);
    expect(await (await call('GET', '/api/plugins/demo')).json()).toEqual({
      gateway: 'demo',
    });
    expect(
      await (await call('POST', '/api/plugins/demo/a/b', { body: 'x' })).json(),
    ).toEqual({ gateway: 'demo' });
  });
});
