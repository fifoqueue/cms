import { expect, test } from 'bun:test';
import {
  assetHtml,
  renderHeaders,
  withAssetOrigins,
} from '#lib/server/render-security.js';
import type { WebAsset } from '@cms/sdk/functions';
import { WebHookBus } from '#lib/server/web-hooks.js';
import { applyWebPresentation } from '#lib/server/web-render.js';
import { emptyPageRender } from '#lib/server/slots.js';

test('web header additions reject policy probes, injection and replacement', async () => {
  const headers = new Headers({ 'x-existing': 'original' });
  const probes = {
    Refresh: '0;url=https://evil.test',
    'Clear-Site-Data': '"*"',
    'Set-Cookie2': 'session=forged',
    Trailer: 'Set-Cookie',
    'X-Existing': 'replacement',
    'X-Injected': 'safe\r\nSet-Cookie: forged',
    'Bad Header': 'value',
    'X-New': 'allowed',
  };

  renderHeaders(headers, probes);
  expect(Object.fromEntries(headers)).toEqual({
    'x-existing': 'original',
    'x-new': 'allowed',
  });
  const bus = new WebHookBus({ info() {}, warn() {}, error() {} });
  const scope = bus.scope('functions:site');

  scope.context.hooks.filter('response.headers', (value) => ({
    ...value,
    'x-api': 'replacement',
  }));
  scope.context.hooks.filter('response.headers', (value) => ({
    ...value,
    'x-new': 'allowed',
  }));
  scope.context.hooks.filter('response.headers', (value) => ({
    ...value,
    'x-new': 'replacement',
  }));
  scope.commit();
  const result = await applyWebPresentation(
    bus,
    { path: '/', kind: 'home' },
    {
      ...emptyPageRender(),
      headers: { 'x-api': 'original' },
    },
  );

  expect(result.render.headers).toEqual({
    'x-api': 'original',
    'x-new': 'allowed',
  });
});

test('render additions preserve security and cache headers and isolate asset CSP origins', () => {
  const headers = new Headers({
    'cache-control': 'private, no-store',
    'content-security-policy': "default-src 'self'; frame-ancestors 'none'",
    'x-frame-options': 'DENY',
  });

  renderHeaders(headers, {
    'Cache-Control': 'public',
    'Content-Security-Policy': '*',
    'X-Frame-Options': 'ALLOWALL',
    'Set-Cookie': 'session=forged',
    'X-Extension': 'ok',
  });
  expect(headers.get('cache-control')).toBe('private, no-store');
  expect(headers.get('x-frame-options')).toBe('DENY');
  expect(headers.has('set-cookie')).toBe(false);
  expect(headers.get('x-extension')).toBe('ok');
  const asset: WebAsset = {
    key: 'app',
    kind: 'script',
    placement: 'footer',
    src: 'https://cdn.example/app.js?a=1&b=2',
    attrs: {
      integrity: 'sha256-example',
      crossorigin: 'anonymous',
      defer: true,
    },
  };

  expect(
    withAssetOrigins(
      headers.get('content-security-policy')!,
      [asset],
      new URL('https://site.example'),
    ),
  ).toBe(
    "default-src 'self'; frame-ancestors 'none'; script-src 'self' https://cdn.example",
  );
  expect(assetHtml(asset)).toBe(
    '<script src="https://cdn.example/app.js?a=1&amp;b=2" integrity="sha256-example" crossorigin="anonymous" defer></script>',
  );
  expect(assetHtml({ ...asset, src: 'x"><img src=x>' })).toContain(
    'src="x&quot;&gt;&lt;img src=x&gt;"',
  );
});
