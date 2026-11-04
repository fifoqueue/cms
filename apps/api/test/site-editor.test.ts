import { expect, test } from 'bun:test';
import { mkdtemp, writeFile, mkdir, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SiteSource } from '#api/infra/functions/site-source';
import { SiteEditor } from '#api/infra/functions/site-editor';
import { FunctionsHost } from '#api/functions-runtime/functions-host';
import { HookBus } from '#api/plugin-runtime/hook-bus';
import type { PluginContext } from '@cms/sdk/plugin';

test('failed editor rename removes temporary source files', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cms-editor-failure-'));
  const logger = { info() {}, warn() {}, error() {} };
  const host = new FunctionsHost({
    sources: async () => [],
    context: () => ({}) as PluginContext,
    logger,
    invalidate() {},
  });
  try {
    await mkdir(join(directory, 'site.ts'));
    const editor = new SiteEditor(directory, true, host, logger);
    await expect(
      editor.write({ source: 'export const functions = {};' }, 'admin'),
    ).rejects.toThrow();
    expect(await readdir(directory)).toEqual(['site.ts']);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('editor gate, validation and live hook rollback use the same site file', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cms-editor-'));
  const source = new SiteSource(directory);
  const logger = { info() {}, warn() {}, error() {} };
  const bus = new HookBus({ logger, timeoutMs: 100 });
  const host = new FunctionsHost({
    sources: async () => {
      const snapshot = await source.source();
      return snapshot ? [snapshot] : [];
    },
    context: (owner, scope) => {
      const registrar = bus.registrar(owner, { trusted: true });
      return {
        hooks: {
          filter: (name, handler) =>
            scope.track(() => registrar.filter(name, handler)),
        },
      } as PluginContext;
    },
    logger,
    invalidate() {},
  });
  const editor = new SiteEditor(directory, false, host, logger);
  const code = (allowed: boolean) =>
    `import { defineFunctions } from '@cms/sdk/functions';
export const functions = defineFunctions({api(ctx) {
ctx.hooks.filter('user.signInAllowed', value => ({...value, allowed: ${allowed}}));
}});`;
  const allowed = async () =>
    (
      await bus.applyFilter(
        'user.signInAllowed',
        { user: {} as never, method: 'password', allowed: false },
        (value) =>
          typeof value === 'object' &&
          value !== null &&
          'allowed' in value &&
          typeof value.allowed === 'boolean',
      )
    ).allowed;
  await expect(editor.write({ source: code(true) }, 'admin')).rejects.toThrow();
  expect((await editor.status()).editorEnabled).toBe(false);
  await writeFile(join(directory, 'editor.enabled'), '');
  await editor.write({ source: code(true) }, 'admin');
  expect(await allowed()).toBe(true);
  await expect(
    editor.write({ source: 'export const = ;' }, 'admin'),
  ).rejects.toThrow();
  expect(await allowed()).toBe(true);
  await editor.write(
    { source: "export const functions = {api() {throw new Error('secret')}};" },
    'admin',
  );
  expect(await allowed()).toBe(true);
  expect((await editor.status()).sources[0]?.lastError).toBe(
    'activation_failed',
  );
  await editor.write({ source: code(false) }, 'admin');
  expect(await allowed()).toBe(false);
  await host.stop();
});
