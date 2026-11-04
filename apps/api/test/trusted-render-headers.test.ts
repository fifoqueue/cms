import { expect, test } from 'bun:test';
import { HookBus } from '#api/plugin-runtime/hook-bus';
import { PageRenderService } from '#api/plugin-runtime/page-render-service';
import { emptySlots } from '#api/plugin-runtime/slot-registry';

test('queued trusted mutations cannot add CSP after header validation', async () => {
  const hooks = new HookBus({
    timeoutMs: 50,
    logger: { info() {}, warn() {}, error() {} },
  });
  const headers: Record<string, string> = { 'x-page': 'safe' };

  hooks
    .registrar('functions:site', { trusted: true })
    .filter('response.headers', (value) => {
      queueMicrotask(() =>
        queueMicrotask(() => {
          headers['content-security-policy'] = "default-src * 'unsafe-inline'";
        }),
      );

      return { ...value, headers };
    });
  const result = await new PageRenderService(
    { render: async () => emptySlots() },
    hooks,
  ).render({});

  expect(headers).toHaveProperty('content-security-policy');
  expect(result.headers).toEqual({ 'x-page': 'safe' });
});

test('trusted in-place header mutations cannot mutate the acceptance baseline', async () => {
  const hooks = new HookBus({
    timeoutMs: 50,
    logger: { info() {}, warn() {}, error() {} },
  });
  const registrar = hooks.registrar('functions:site', { trusted: true });

  registrar.filter('response.headers', (value) => {
    value.headers['content-security-policy'] = "default-src * 'unsafe-inline'";

    return value;
  });
  const result = await new PageRenderService(
    { render: async () => emptySlots() },
    hooks,
  ).render({});

  expect(result.headers).toEqual({});
});
