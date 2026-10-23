import { describe, expect, test } from 'bun:test';
import type { AuthService } from '#api/domain/auth/auth-service';
import type { SsoService } from '#api/domain/auth/sso-service';
import type { ContentService } from '#api/domain/content/content-service';
import type { PublicContentService } from '#api/domain/content/public-content';
import type { SiteService } from '#api/domain/site/site-service';
import type { SeoSettingsService } from '#api/domain/seo/seo-settings-service';
import type { SeoDiscoveryService } from '#api/domain/seo/seo-discovery-service';
import type { PermalinkService } from '#api/domain/permalinks/permalink-service';
import type { PermalinkResolver } from '#api/domain/permalinks/permalink-resolver';
import type {
  PublicTaxonomyService,
  TaxonomyService,
} from '#api/domain/taxonomy/taxonomy-service';
import type { ThemeService } from '#api/domain/theme/theme-service';
import { createApiApp } from '#api/http/app';
import type { ApiServices } from '#api/http/services';
import type { PluginGateway } from '#api/http/plugin-gateway';
import { ClientResolver } from '#api/http/client-identity';
import type { PluginHost } from '#api/plugin-runtime/plugin-host';
import type { SlotService } from '#api/plugin-runtime/slot-service';
import { conflict } from '#api/shared/errors';
import type { UserService } from '#api/domain/users/user-service';
import { profile } from '#test/support/memory';

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
} as unknown as AuthService;

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
    auth,
    sso: {
      info: () => ({ enabled: false }),
      unlink: record('sso.unlink'),
    } as unknown as SsoService,
    clients: new ClientResolver(undefined),
    site: { get: record('site.get') } as unknown as SiteService,
    seo: {
      getPublic: record('seo.public'),
      getAdmin: record('seo.admin'),
      update: record('seo.update'),
    } as unknown as SeoSettingsService,
    seoDiscovery: {
      list: record('seo.discovery'),
    } as unknown as SeoDiscoveryService,
    permalinks: {
      get: record('permalinks.get'),
      update: record('permalinks.update'),
    } as unknown as PermalinkService,
    permalinkResolver: {
      resolve: record('permalinks.resolve'),
    } as unknown as PermalinkResolver,
    publicTaxonomy: {
      list: record('taxonomy.public.list', []),
      getBySlug: record('taxonomy.public.get'),
    } as unknown as PublicTaxonomyService,
    adminTaxonomy: {
      list: record('taxonomy.admin.list', []),
      create: record('taxonomy.admin.create'),
      update: record('taxonomy.admin.update'),
      remove: record('taxonomy.admin.remove'),
    } as unknown as TaxonomyService,
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
    } as unknown as ThemeService,
    publicContent: {
      list: record('public.list'),
      getBySlug: async (slug: string) => {
        if (slug === 'taken') throw conflict('slug taken');

        if (slug === 'boom') throw new Error('secret failure');

        return { slug };
      },
    } as unknown as PublicContentService,
    slots: { render: record('slots') } as unknown as SlotService,
    adminContent: {
      list: record('admin.list'),
      create: record('admin.create'),
      get: record('admin.get'),
      update: record('admin.update'),
      remove: record('admin.remove'),
    } as unknown as ContentService,
    users: {
      list: record('users.list', []),
    } as unknown as UserService,
    roles: {} as ApiServices['roles'],
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
    patterns: {} as ApiServices['patterns'],
    menus: {} as ApiServices['menus'],
    widgets: {} as ApiServices['widgets'],
    comments: {} as ApiServices['comments'],
    search: {} as ApiServices['search'],
    pluginPages: {} as ApiServices['pluginPages'],
    dashboardWidgets: {} as ApiServices['dashboardWidgets'],
    webhooks: {} as ApiServices['webhooks'],
    siteHealth: {} as ApiServices['siteHealth'],
    ssoSettings: {} as ApiServices['ssoSettings'],
    frontendSecret: 'test-frontend-secret',
    themePreviews: {} as ApiServices['themePreviews'],
    importer: {} as ApiServices['importer'],
    exporter: {} as ApiServices['exporter'],
    contentTypes: {} as ApiServices['contentTypes'],
    fields: {} as ApiServices['fields'],
    apiTokens: {} as ApiServices['apiTokens'],
    security: {} as ApiServices['security'],
    email: {} as ApiServices['email'],
    plugins: {
      list: record('plugins.list', []),
      install: record('plugins.install'),
      enable: record('plugins.enable'),
    } as unknown as PluginHost,
    pluginGateway: {
      handle: async (id: string) => Response.json({ gateway: id }),
    } as unknown as PluginGateway,
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
    expect((await call('DELETE', '/api/v1/auth/sso/identity')).status).toBe(
      401,
    );
    expect(
      (await call('DELETE', '/api/v1/auth/sso/identity', { token: TOKEN }))
        .status,
    ).toBe(204);
    expect(await (await call('GET', '/api/plugins/demo')).json()).toEqual({
      gateway: 'demo',
    });
    expect(
      await (await call('POST', '/api/plugins/demo/a/b', { body: 'x' })).json(),
    ).toEqual({ gateway: 'demo' });
  });
});
