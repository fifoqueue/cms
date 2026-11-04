import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { once } from 'node:events';
import { strict as assert } from 'node:assert';
import { withDeadline as deadline } from '#web-test/functions-test-process.mjs';

export const runServerSmoke = async () => {
  const root = resolve('apps/web');
  const directory = await mkdtemp(join(root, '.functions-server-'));
  const activated = Promise.withResolvers();
  let deliveries = 0;
  let code;
  const api = createServer(async (request, response) => {
    response.setHeader('content-type', 'application/json');

    if (request.url === '/activated') {
      activated.resolve();
      response.end('{}');
    } else if (request.url === '/api/v1/internal/functions') {
      deliveries++;
      const hash = createHash('sha256').update(code).digest('hex');

      response.end(
        JSON.stringify({
          version: hash,
          sources: [{ owner: 'functions:site', hash, code }],
        }),
      );
    } else if (request.url === '/api/v1/install/status') {
      response.end(
        JSON.stringify({ databaseConfigured: false, setupRequired: true }),
      );
    } else {
      response.statusCode = 404;
      response.end(
        JSON.stringify({ error: { code: 'not_found', message: 'not found' } }),
      );
    }
  });
  let child;
  let exited;

  try {
    api.listen(0, '127.0.0.1');
    await once(api, 'listening', { signal: AbortSignal.timeout(5000) });
    const apiUrl = `http://127.0.0.1:${api.address().port}`;
    const env = {
      ...process.env,
      CMS_API_URL: apiUrl,
      CMS_FRONTEND_SECRET: 'smoke-proof',
      WEB_HOST: '127.0.0.1',
      WEB_PORT: '0',
    };

    code = `import { defineFunctions } from '@cms/sdk/functions'; export const functions = defineFunctions({ async web(ctx) { ctx.logger.info('smoke activation'); await fetch('${apiUrl}/activated', {method:'POST'}); } });`;
    await mkdir(join(directory, 'scripts'));
    await Promise.all(
      [
        'server.js',
        'env-filter.js',
        'package.json',
        'scripts/release.js',
        'src',
        'vite.config.ts',
        'tsconfig.json',
      ].map((path) =>
        cp(join(root, path), join(directory, path), { recursive: true }),
      ),
    );
    const build = promisify(execFile)(
      'node',
      [
        join(
          dirname(fileURLToPath(import.meta.resolve('vite/package.json'))),
          'bin/vite.js',
        ),
        'build',
      ],
      {
        cwd: directory,
        env,
        timeout: 120000,
        killSignal: 'SIGKILL',
        maxBuffer: 4 * 1024 * 1024,
      },
    );
    const buildClosed = new Promise((resolve) =>
      build.child.once('close', resolve),
    );

    try {
      await build;
    } finally {
      build.child.kill('SIGKILL');
      await deadline(buildClosed, 5000, 'build exit');
    }

    child = spawn('node', [resolve(root, 'test/functions-built-server.mjs')], {
      cwd: directory,
      env,
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      windowsHide: true,
    });
    exited = once(child, 'close');
    child.stdout.on('data', (chunk) => process.stdout.write(chunk));
    child.stderr.on('data', (chunk) => process.stderr.write(chunk));
    const [{ port }] = await Promise.race([
      once(child, 'message', { signal: AbortSignal.timeout(15000) }),
      exited.then(() => {
        throw new Error('server exited before readiness');
      }),
    ]);
    const response = await fetch(`http://127.0.0.1:${port}/admin/setup`, {
      signal: AbortSignal.timeout(20000),
    });
    const html = await response.text();

    assert.equal(response.status, 200, html);
    assert.match(html, /<form/);
    await deadline(activated.promise, 20000, 'loader activation');

    assert.equal(deliveries, 1);
    console.log(
      'Real built server.js booted functions and rendered the setup page',
    );
  } finally {
    child?.kill('SIGKILL');

    try {
      if (exited) await deadline(exited, 5000, 'server exit');
    } finally {
      try {
        api.closeAllConnections();
        await deadline(
          new Promise((resolve) => api.close(resolve)),
          5000,
          'API close',
        );
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    }
  }
};
