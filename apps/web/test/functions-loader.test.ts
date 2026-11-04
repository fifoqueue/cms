import { expect, test } from 'bun:test';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { WebFunctionsContext } from '@cms/sdk/functions';
import { WebFunctionsLoader } from '#lib/server/functions-loader.js';
import { WebHookBus } from '#lib/server/web-hooks.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { watch } from 'node:fs';
import { withDeadline } from '#web-test/functions-test-process.mjs';

test('compiler deadlines preserve last good scopes and stop kills an in-flight compiler', async () => {
  const probe = promisify(execFile)('node', ['-p', 'process.execPath'], {
    timeout: 3000,
    killSignal: 'SIGKILL',
    windowsHide: true,
  });
  const probeClosed = new Promise<void>((resolve) =>
    probe.child.once('close', () => resolve()),
  );
  let node: string;

  try {
    node = (await probe).stdout.trim();
  } finally {
    probe.child.kill('SIGKILL');
    await withDeadline(probeClosed, 3000, 'node probe exit');
  }

  const directory = await mkdtemp(join(tmpdir(), 'web-compiler-stop-'));
  const saved = {
    options: process.env.NODE_OPTIONS,
    ready: process.env.COMPILER_READY,
  };
  const bus = new WebHookBus({ info() {}, warn() {}, error() {} });
  let code = `export const functions = { web(ctx) { ctx.hooks.filter('page.bodyClasses', () => ['good']); } };`;
  const options = {
    directory,
    url: 'http://localhost/internal/functions',
    secret: () => 'proof',
    logger: { info() {}, warn() {}, error() {} },
    scope: (owner: string) => bus.scope(owner),
    compilerExecutable: process.execPath,
    compilerTimeoutMs: 1000,
    fetch: (async () =>
      Response.json({
        version: digest(code),
        sources: [{ owner: 'functions:site', hash: digest(code), code }],
      })) as typeof fetch,
  };
  const loader = new WebFunctionsLoader(options);
  const alive = () =>
    bus.apply(
      'page.bodyClasses',
      [],
      { path: '/', kind: 'home' },
      (value) => value as string[],
    );
  const stall = async (name: string) => {
    const ready = Promise.withResolvers<number>();
    const marker = join(directory, name);
    const watcher = watch(directory, (_event, file) => {
      if (String(file) === name)
        void readFile(marker, 'utf8').then(
          (text) => ready.resolve(Number(text)),
          ready.reject,
        );
    });

    process.env.COMPILER_READY = marker;
    options.compilerExecutable = node;
    code += '\n';
    const refresh = loader.refresh();

    try {
      const pid = await Promise.race([
        ready.promise,
        refresh.then(() => {
          throw new Error('compiler exited before readiness');
        }),
      ]);

      return { pid, refresh };
    } finally {
      watcher.close();
    }
  };

  try {
    await loader.refresh();
    process.env.NODE_OPTIONS = `--import=${import.meta.resolve('#web-test/functions-stalled-compiler.mjs')}`;
    const timed = await stall('deadline');

    await timed.refresh;
    expect(() => process.kill(timed.pid, 0)).toThrow();
    expect(await alive()).toEqual(['good']);
    const stopped = await stall('stopping');

    await loader.stop();
    await stopped.refresh;
    expect(() => process.kill(stopped.pid, 0)).toThrow();
    expect(await alive()).toEqual([]);
    delete process.env.NODE_OPTIONS;
    options.compilerExecutable = process.execPath;
    await loader.refresh();
    expect(await alive()).toEqual(['good']);
  } finally {
    await loader.stop();
    if (saved.options === undefined) delete process.env.NODE_OPTIONS;
    else process.env.NODE_OPTIONS = saved.options;
    if (saved.ready === undefined) delete process.env.COMPILER_READY;
    else process.env.COMPILER_READY = saved.ready;
    await rm(directory, { recursive: true, force: true });
  }
}, 10000);

test('the running compiler works with an empty PATH under Bun', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'web-compiler-path-'));
  const path = process.env.PATH;
  const loader = deliveredLoader(
    directory,
    () => 'export const functions = { web() {} };',
  );

  try {
    process.env.PATH = '';
    await loader.refresh();
    expect(await readdir(directory)).toHaveLength(1);
  } finally {
    process.env.PATH = path;
    await loader.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

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

    await withDeadline(started.promise, 5000, 'module import readiness');
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
    await withDeadline(importing, 5000, 'module import completion');
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
