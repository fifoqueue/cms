import { test, expect } from 'bun:test';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SiteSource } from '#api/infra/functions/site-source';
import type { PluginContext } from '@cms/sdk/plugin';
import { FunctionsHost } from '#api/functions-runtime/functions-host';
import { FunctionsWatch } from '#api/infra/functions/functions-watch';

test('external file edits activate without restarting the watcher', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cms-watch-'));
  const source = new SiteSource(directory);
  const activated = Promise.withResolvers<string>();
  const logger = { info() {}, warn() {}, error() {} };
  const host = new FunctionsHost({
    sources: async () => {
      const snapshot = await source.source();

      return snapshot ? [snapshot] : [];
    },
    context: () =>
      ({
        logger: { ...logger, info: activated.resolve },
      }) as unknown as PluginContext,
    logger,
    invalidate() {},
  });
  const watcher = new FunctionsWatch(directory, host, logger);

  await watcher.start();

  try {
    await writeFile(
      join(directory, 'site.ts'),
      `export const functions = { api(ctx) { ctx.logger.info('live'); } };`,
    );
    expect(await activated.promise).toBe('live');
  } finally {
    await watcher.stop();
  }
});

test('site loader resolves SDK imports outside the workspace and reloads changed exports', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cms-functions-'));
  const source = new SiteSource(directory);

  expect(await source.source()).toBeNull();
  const seen: string[] = [];
  const context = {
    logger: {
      info: (value: string) => {
        seen.push(value);
      },
      warn() {},
      error() {},
    },
  } as unknown as PluginContext;

  for (const value of ['first', 'second']) {
    await writeFile(
      join(directory, 'site.ts'),
      `import { defineFunctions } from '@cms/sdk/functions';
export const functions = defineFunctions({ api(ctx) { ctx.logger.info('${value}'); } });`,
    );
    const snapshot = await source.source();

    await (
      await snapshot!.load()
    ).api!(context);
  }

  expect(seen).toEqual(['first', 'second']);
});
