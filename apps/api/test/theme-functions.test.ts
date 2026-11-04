import { expect, test } from 'bun:test';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { zipSync, strToU8 } from 'fflate';
import { zipThemeArchive } from '#api/infra/zip-theme-archive';
import { versionedSource } from '#api/infra/functions/versioned-source';
import { FunctionsHost } from '#api/functions-runtime/functions-host';
import type { PluginContext } from '@cms/sdk/plugin';
import { ThemeService } from '#api/domain/theme/theme-service';
import { BUILTIN_THEMES } from '#api/domain/theme/builtin-themes';
import { Elysia } from 'elysia';
import { routes as installRoutes } from '#api/http/routes/api/v1/admin/themes/index';
import { routes as activateRoutes } from '#api/http/routes/api/v1/admin/themes/[id]/activate';
import type { ApiApp } from '#api/http/services';
import { toErrorResponse } from '#api/http/respond';

test('installed theme functions follow activation, upgrade and removal across readers', async () => {
  const values = new Map<string, unknown>();
  const settings = {
    async get(key: string) {
      return structuredClone(values.get(key));
    },
    async set(key: string, value: unknown) {
      values.set(key, structuredClone(value));
    },
    async list() {
      return Object.fromEntries(values);
    },
  };
  const observed: (string | undefined)[] = [];
  const reader = new ThemeService(settings, zipThemeArchive);
  const themes = new ThemeService(
    settings,
    zipThemeArchive,
    undefined,
    undefined,
    undefined,
    async () => {
      observed.push((await reader.activeFunctions())?.text);
    },
  );
  const pack = (source?: string) => {
    const theme = BUILTIN_THEMES[0]!;

    return zipSync({
      'theme/theme.json': strToU8(
        JSON.stringify({ ...theme.manifest, id: 'uploaded' }),
      ),
      ...Object.fromEntries(
        Object.entries(theme.templates).map(([name, blocks]) => [
          `theme/templates/${name}.json`,
          strToU8(JSON.stringify(blocks)),
        ]),
      ),
      ...(source === undefined
        ? {}
        : { 'theme/functions.ts': strToU8(source) }),
    });
  };
  const source = 'export const functions = { api() {} };';
  const admin = { id: 'admin', role: 'administrator' };
  const appearance = {
    id: 'designer',
    role: 'designer',
    capabilities: ['appearance.manage'],
  };
  const routeApp = (prefix: string) =>
    new Elysia({ prefix })
      .decorate('themes', themes)
      .decorate('auth', { authenticate: async () => appearance })
      .onError(({ error }) =>
        toErrorResponse(error, { info() {}, warn() {}, error() {} }),
      );
  const upload = installRoutes(routeApp('/themes') as unknown as ApiApp);
  const response = await upload.handle(
    new Request('http://localhost/themes', {
      method: 'POST',
      headers: { authorization: 'Bearer designer' },
      body: pack(source),
    }),
  );

  expect(response.status).toBe(403);
  expect(await response.json()).toMatchObject({ error: { code: 'forbidden' } });
  await expect(themes.install(pack(source), appearance)).rejects.toMatchObject({
    code: 'forbidden',
  });
  await themes.install(pack(), appearance);
  await themes.install(pack(source), admin);
  const activation = activateRoutes(
    routeApp('/themes/:id/activate') as unknown as ApiApp,
  );

  expect(
    (
      await activation.handle(
        new Request('http://localhost/themes/uploaded/activate', {
          method: 'POST',
          headers: { authorization: 'Bearer designer' },
        }),
      )
    ).status,
  ).toBe(403);
  expect(await reader.activeFunctions()).toBeNull();
  await expect(themes.activate('uploaded', appearance)).rejects.toMatchObject({
    code: 'forbidden',
  });
  await themes.activate('uploaded', admin);
  expect(await reader.activeFunctions()).toEqual({
    owner: 'theme:uploaded',
    text: source,
  });
  await themes.activate('canvas', appearance);
  expect(await reader.activeFunctions()).toBeNull();
  await themes.activate('uploaded', admin);
  await themes.install(pack(), appearance);
  expect(await reader.activeFunctions()).toBeNull();
  await themes.install(pack(source), admin);
  await expect(themes.remove('uploaded')).rejects.toMatchObject({
    code: 'conflict',
  });
  await themes.activate('canvas', appearance);
  await themes.remove('uploaded');
  expect(await reader.activeFunctions()).toBeNull();
  expect((await themes.getPublic()).id).toBe('canvas');
  expect(observed).toEqual([
    undefined,
    undefined,
    source,
    undefined,
    source,
    undefined,
    source,
    undefined,
    undefined,
  ]);
});

test('archive rejects invalid and oversized functions before execution', () => {
  for (const text of ['export const functions = {', ' '.repeat(262145)]) {
    expect(() =>
      zipThemeArchive.read(
        zipSync({
          'functions.ts': strToU8(text),
        }),
      ),
    ).toThrow();
  }
});

test('theme versions retain recovery and prune superseded imports', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'theme-functions-'));
  let text = 'export const functions = { api() {} };';
  const host = new FunctionsHost({
    sources: async () => [versionedSource(directory, 'theme:test', text)],
    context: () => ({}) as PluginContext,
    logger: { info() {}, warn() {}, error() {} },
    invalidate() {},
  });

  try {
    await host.reconcile();
    const good = host.status()[0]!.loadedHash;

    text = 'export const functions = { api() { throw Error("broken"); } };';
    await host.reconcile();
    expect(host.status()[0]!.loadedHash).toBe(good);
    expect(host.status()[0]!.lastError).toBe('activation_failed');
    expect(await readdir(join(directory, '.versions'))).toHaveLength(1);
    text = 'export const functions = { api() {}, web() {} };';
    await host.reconcile();
    expect(host.status()[0]!.lastError).toBeNull();
    expect(await readdir(join(directory, '.versions'))).toHaveLength(1);
    await host.stop();
    expect(await readdir(join(directory, '.versions'))).toHaveLength(0);
  } finally {
    await host.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
