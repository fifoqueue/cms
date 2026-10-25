import { describe, expect, test } from 'bun:test';
import { DashboardPreferencesService } from '#api/domain/dashboard/dashboard-preferences';
import { createApiApp } from '#api/http/app';
import type { ApiServices } from '#api/http/services';
import { ClientResolver } from '#api/http/client-identity';
import { conflict, expiredSignIn } from '#api/shared/errors';
import { MemorySettings, profile } from '#test/support/memory';

const TOKEN = 'admin-token';
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
    clients: new ClientResolver('content-proof'),
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
    commentNotifier: {} as ApiServices['commentNotifier'],
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
  test('content writes accept origin only from the frontend proof', async () => {
    for (const secret of ['forged', 'content-proof']) {
      for (const method of ['POST', 'PUT']) {
        calls.length = 0;
        await app.fetch(
          new Request(
            `http://localhost/api/v1/admin/content${method === 'PUT' ? '/abc' : ''}`,
            {
              method,
              headers: {
                authorization: `Bearer ${TOKEN}`,
                'content-type': 'application/json',
                'x-cms-frontend-secret': secret,
                'x-cms-client-address': '192.0.2.3',
                'x-cms-client-user-agent': 'Browser',
              },
              body: JSON.stringify({ title: 'Origin' }),
            },
          ),
        );
        expect(calls[0]?.at(-1)).toEqual(
          secret === 'content-proof'
            ? { ip: '192.0.2.3', userAgent: 'Browser' }
            : { ip: null, userAgent: null },
        );
      }
    }
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
      ['admin.create', { title: 'Hi' }, user, { ip: null, userAgent: null }],
      [
        'admin.update',
        'abc',
        { title: 'Yo' },
        user,
        undefined,
        { ip: null, userAgent: null },
      ],
      ['admin.remove', 'abc', user],
      ['admin.list', { page: '3' }, user],
      ['plugins.enable', 'p-1'],
    ]);
  });
});
