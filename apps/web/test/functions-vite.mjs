import { build, createServer, preview } from 'vite';
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { strict as assert } from 'node:assert';

const root = resolve('apps/web');
const directory = await mkdtemp(join(root, '.functions-vite-'));
const exercise = async (WebFunctionsLoader) => {
  const messages = [];
  const code = `import { defineFunctions } from '@cms/sdk/functions';
    export const functions = defineFunctions({ web(ctx) { const message: string = 'activated'; ctx.logger.info(message); } });`;
  const hash = createHash('sha256').update(code).digest('hex');
  const logger = {
    info: (message) => messages.push(message),
    warn: console.warn,
    error: console.error,
  };

  const loader = new WebFunctionsLoader({
    directory,
    url: 'http://localhost/internal/functions',
    secret: () => 'proof',
    logger,
    compilerTimeoutMs: 5000,
    fetch: async () =>
      Response.json({
        version: hash,
        sources: [{ owner: 'functions:site', hash, code }],
      }),
    scope: () => ({ context: { logger }, commit() {}, dispose() {} }),
  });

  try {
    await loader.refresh();
    assert.deepEqual(messages, ['activated']);
  } finally {
    await loader.stop();
  }
};

let server;
let serving;

try {
  server = await createServer({
    configFile: false,
    root,
    cacheDir: join(directory, 'cache'),
    server: { middlewareMode: true },
    ssr: { noExternal: ['@cms/sdk'] },
  });
  await exercise(
    (await server.ssrLoadModule('/src/lib/server/functions-loader.ts'))
      .WebFunctionsLoader,
  );
  console.log('Node Vite development SSR activated web functions');
  await server.close();
  server = undefined;
  const outDir = join(directory, 'production');

  await build({
    configFile: false,
    root,
    logLevel: 'warn',
    ssr: { noExternal: true },
    build: { ssr: resolve(root, 'src/lib/server/functions-loader.ts'), outDir },
  });
  const { WebFunctionsLoader } = await import(
    pathToFileURL(join(outDir, 'functions-loader.js')).href
  );

  serving = await preview({
    configFile: false,
    root,
    build: { outDir },
    preview: { host: '127.0.0.1', port: 0 },
    plugins: [
      {
        name: 'functions-preview',
        configurePreviewServer(server) {
          server.middlewares.use(async (_request, response) => {
            try {
              await exercise(WebFunctionsLoader);
              response.end('activated');
            } catch (error) {
              console.error(error);
              response.statusCode = 500;
              response.end('failed');
            }
          });
        },
      },
    ],
  });
  const address = serving.httpServer.address();
  const response = await fetch(`http://127.0.0.1:${address.port}/`, {
    signal: AbortSignal.timeout(10000),
  });

  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'activated');
  console.log('Node Vite production build and preview activated web functions');
} finally {
  await server?.close();
  await new Promise((resolve, reject) => {
    if (!serving) return resolve();
    serving.httpServer.close((error) => (error ? reject(error) : resolve()));
    serving.httpServer.closeAllConnections();
  });
  await rm(directory, { recursive: true, force: true });
}
