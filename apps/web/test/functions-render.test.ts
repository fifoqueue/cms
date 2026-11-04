import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createContentClient } from '@cms/sdk/client';
import { WebFunctionsLoader } from '#lib/server/functions-loader.js';
import { WebHookBus } from '#lib/server/web-hooks.js';
import { renderRequest } from '#lib/server/render-request.js';
import { emptyPageRender, loadSlots } from '#lib/server/slots.js';

test('delivered web functions affect public rendering through one cached page RPC', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'functions-render-'));
  const bus = new WebHookBus(console);
  const code = `export const functions = { web(ctx) {
    ctx.hooks.filter('page.bodyClasses', value => [...value, 'delivered']);
    ctx.hooks.filter('response.headers', value => ({...value, 'x-delivered': 'yes'}));
    ctx.hooks.filter('response.headers', value => ({...value, 'set-cookie': 'bad'}));
    ctx.assets.register({key:'app', kind:'script', src:'https://cdn.example/app.js?a=1&b=2', placement:'head', attrs:{defer:true, integrity:'sha256-YWJj', crossorigin:'anonymous'}});
    ctx.slots.provide('body.open', () => '<p onclick="bad()">Delivered</p>');
  }};`;
  const hash = createHash('sha256').update(code).digest('hex');
  const loader = new WebFunctionsLoader({
    directory,
    url: 'http://localhost/api/v1/internal/functions',
    secret: () => 'paired',
    logger: console,
    scope: (owner) => bus.scope(owner),
    fetch: (async () =>
      Response.json({
        version: hash,
        sources: [{ owner: 'functions:site', hash, code }],
      })) as typeof fetch,
  });
  let calls = 0;
  const api = createContentClient({
    baseUrl: 'http://localhost',
    fetch: (async () => {
      calls++;

      return Response.json(emptyPageRender());
    }) as typeof fetch,
  });

  try {
    loader.start();
    await loader.refresh();
    await renderRequest.run({ bus }, async () => {
      const [first, second] = await Promise.all([
        loadSlots(api, { path: '/' }),
        loadSlots(api, { path: '/' }),
      ]);

      expect(calls).toBe(1);
      expect(first).toEqual(second);
      expect(first.presentation?.render.bodyClasses).toEqual(['delivered']);
      expect(first.presentation?.render.headers).toEqual({
        'x-delivered': 'yes',
      });
      expect(first['body.open']).toEqual(['<p>Delivered</p>']);
      expect(first.presentation?.headHtml).toBe(
        '<script src="https://cdn.example/app.js?a=1&amp;b=2" integrity="sha256-YWJj" crossorigin="anonymous" defer></script>',
      );
    });
  } finally {
    await loader.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
