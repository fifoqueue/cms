import { expect, test } from 'bun:test';
import { acceptsResponseHeaders } from '@cms/sdk';
import { HookBus } from '#api/plugin-runtime/hook-bus';
import { PageRenderService } from '#api/plugin-runtime/page-render-service';
import { emptySlots } from '#api/plugin-runtime/slot-registry';

test('page headers are additive and cannot weaken CSP or other security policy', async () => {
  const hooks = new HookBus({
    timeoutMs: 100,
    logger: { info() {}, warn() {}, error() {} },
  });
  const registrar = hooks.registrar('headers');

  registrar.filter('response.headers', (value) => ({
    ...value,
    headers: { 'X-Page': 'yes' },
  }));
  registrar.filter('response.headers', (value) => ({
    ...value,
    headers: { 'X-Page': 'changed' },
  }));

  for (const name of [
    'Content-Security-Policy',
    'X-Frame-Options',
    'Strict-Transport-Security',
    'Set-Cookie',
    'Location',
    'Access-Control-Allow-Origin',
  ])
    registrar.filter('response.headers', (value) => ({
      ...value,
      headers: { ...value.headers, [name]: '*' },
    }));
  const result = await new PageRenderService(
    { render: async () => emptySlots() },
    hooks,
  ).render({ kind: 'home' });

  expect(result.headers).toEqual({ 'X-Page': 'yes' });
  expect(acceptsResponseHeaders({ 'cache-control': 'public' }, {}, true)).toBe(
    false,
  );
  expect(
    acceptsResponseHeaders({ 'X-Test': 'ok\r\nSet-Cookie: injected' }, {}),
  ).toBe(false);
  expect(acceptsResponseHeaders({ 'X-Test': 'a', 'x-test': 'b' }, {})).toBe(
    false,
  );
  expect(
    acceptsResponseHeaders(
      {},
      { 'content-security-policy': "default-src 'self'" },
    ),
  ).toBe(false);
});
