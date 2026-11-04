import { expect, test } from 'bun:test';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { WebFunctionsContext } from '@cms/sdk/functions';
import { WebFunctionsLoader } from '#lib/server/functions-loader.js';
import { WebHookBus } from '#lib/server/web-hooks.js';

const digest = (code: string) =>
  createHash('sha256').update(code).digest('hex');

const deliveredLoader = (directory: string, source: () => string) => {
  const logger = { info() {}, warn() {}, error() {} };
  const bus = new WebHookBus(logger);

  return new WebFunctionsLoader({
    directory,
    url: 'http://localhost/api/v1/internal/functions',
    secret: () => 'proof',
    scope: (owner) => bus.scope(owner),
    logger,
    fetch: (async () => {
      const code = source();
      const hash = digest(code);

      return Response.json({
        version: hash,
        sources: [{ owner: 'functions:site', hash, code }],
      });
    }) as typeof fetch,
  });
};

test('successful swaps retain current and last good files without pruning another pending import', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'web-version-retention-'));
  const key = `functions-${randomUUID()}`;
  const started = Promise.withResolvers<void>();
  const gate = Promise.withResolvers<void>();
  const versions = [1, 2, 3].map(
    (value) => `export const functions = { web() { return void ${value}; } };`,
  );
  let current = versions[0]!;
  const loader = deliveredLoader(directory, () => current);
  const blockedCode = `globalThis[${JSON.stringify(key)}].started(); await globalThis[${JSON.stringify(key)}].wait; export const functions = { web() {} };`;
  const other = deliveredLoader(directory, () => blockedCode);

  Object.defineProperty(globalThis, key, {
    configurable: true,
    value: { started: started.resolve, wait: gate.promise },
  });

  try {
    await loader.refresh();
    const importing = other.refresh();

    await started.promise;
    const otherDirectory = (await readdir(directory)).find((name) =>
      name.startsWith(digest(blockedCode)),
    )!;
    const otherModule = join(directory, otherDirectory, 'module.mjs');
    const retained = await readFile(otherModule, 'utf8');

    current = versions[1]!;
    await loader.refresh();
    current = versions[2]!;
    await loader.refresh();
    const files = await readdir(directory);

    expect(files.some((name) => name.startsWith(digest(versions[0]!)))).toBe(
      false,
    );
    expect(files.some((name) => name.startsWith(digest(versions[1]!)))).toBe(
      true,
    );
    expect(files.some((name) => name.startsWith(digest(versions[2]!)))).toBe(
      true,
    );
    expect(await readFile(otherModule, 'utf8')).toBe(retained);
    gate.resolve();
    await importing;
    await loader.stop();
    expect(await readdir(directory)).toEqual([otherDirectory]);
  } finally {
    gate.resolve();
    await Promise.all([loader.stop(), other.stop()]);
    Reflect.deleteProperty(globalThis, key);
    await rm(directory, { recursive: true, force: true });
  }
});

test('the same hash retries after a transient import failure', async () => {
  const root = await mkdtemp(join(tmpdir(), 'web-import-retry-'));
  const dependency = join(root, 'ready.txt');
  const code = `import { readFile } from 'node:fs/promises'; await readFile(${JSON.stringify(dependency)}); export const functions = { web() {} };`;
  const directory = join(root, 'versions');
  const loader = deliveredLoader(directory, () => code);

  try {
    await loader.refresh();
    expect(await readdir(directory)).toEqual([]);
    await writeFile(dependency, 'ready');
    await loader.refresh();
    const files = await readdir(directory);

    expect(files).toHaveLength(1);
    expect(files[0]!.startsWith(digest(code))).toBe(true);
  } finally {
    await loader.stop();
    await rm(root, { recursive: true, force: true });
  }
});

test('web functions load theme before site and keep active scopes after failed updates', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'web-functions-'));
  const events: string[] = [];
  const active = new Set<string>();
  let conditional = '';
  let failed = false;
  let revision = 1;
  const logger = {
    info: (message: string) => {
      events.push(message);
    },
    warn: () => {},
    error: () => {},
  };
  const loader = new WebFunctionsLoader({
    directory,
    url: 'http://localhost/api/v1/internal/functions',
    secret: () => 'proof',
    logger,
    scope(owner) {
      return {
        context: { logger } as WebFunctionsContext,
        commit() {
          active.add(owner);
        },
        dispose() {
          active.delete(owner);
        },
      };
    },
    fetch: (async (_url, init) => {
      conditional = new Headers(init?.headers).get('if-none-match') ?? '';
      const version = String(revision).repeat(64);

      if (conditional === `"${version}"`)
        return new Response(null, { status: 304 });
      const sources = ['theme:example', 'functions:site'].map((owner) => {
        const code = failed
          ? 'throw new Error("activation failure");'
          : `import { defineFunctions } from '@cms/sdk/functions';
             export const functions = defineFunctions({ web(ctx) { ctx.logger.info(${JSON.stringify(owner)}); } });`;

        return {
          owner,
          hash: createHash('sha256').update(code).digest('hex'),
          code,
        };
      });

      return Response.json({ version, sources });
    }) as typeof fetch,
  });

  try {
    await loader.refresh();
    expect(events).toEqual(['theme:example', 'functions:site']);
    expect([...active]).toEqual(['theme:example', 'functions:site']);
    await loader.refresh();
    expect(conditional).toBe(`"${'1'.repeat(64)}"`);
    expect(events).toHaveLength(2);
    failed = true;
    revision = 2;
    await loader.refresh();
    expect([...active]).toEqual(['theme:example', 'functions:site']);
    failed = false;
    revision = 3;
    await loader.refresh();
    expect(events).toHaveLength(4);
    expect([...active]).toEqual(['theme:example', 'functions:site']);
  } finally {
    await loader.stop();
    await rm(directory, { recursive: true, force: true });
  }

  expect(active.size).toBe(0);
});
