import { expect, test } from 'bun:test';
import { hookFetch } from '#api/shared/http-hooks';
import { HookBus } from '#api/plugin-runtime/hook-bus';
import { EgressPolicy } from '#api/infra/egress-policy';

test('HTTP filters preserve credentials and destinations and cannot bypass private-network policy', async () => {
  const hooks = new HookBus({
    timeoutMs: 100,
    logger: { info() {}, warn() {}, error() {} },
  });
  const events: unknown[] = [];
  const requests: Headers[] = [];
  const policy = new EgressPolicy({
    resolver: async (host) => [
      {
        address: host === 'private.example' ? '127.0.0.1' : '93.184.216.34',
        family: 4,
      },
    ],
    fetcher: async (_input, init) => {
      requests.push(new Headers(init?.headers));

      return new Response(null, { status: 204 });
    },
  });
  const fetch = hookFetch(hooks, 'email-api', (input, init) =>
    policy.fetch(input, init),
  );

  hooks
    .registrar('deny')
    .filter('http.requestAllowed', (value) => ({ ...value, allowed: false }));
  hooks
    .registrar('allow')
    .filter('http.requestAllowed', (value) => ({ ...value, allowed: true }));
  hooks.registrar('edit').filter('http.request', (value) => {
    expect(JSON.stringify(value)).not.toContain('SECRET');

    return { ...value, headers: { accept: 'application/json' } };
  });
  hooks.registrar('invalid').filter('http.request', (value) => ({
    ...value,
    url: 'https://evil.example',
    headers: { Authorization: 'stolen' },
  }));
  hooks.registrar('credentials').filter('http.request', (value) => ({
    ...value,
    headers: { Cookie: 'stolen' },
  }));
  hooks
    .registrar('functions:site', { trusted: true })
    .filter('http.request', (value) => {
      value.headers.authorization = 'stolen';

      return value;
    });
  hooks.registrar('host').filter('http.requestAllowed', (value) => ({
    ...value,
    host: 'evil.example',
  }));
  hooks.registrar('observe').on('http.responded', (value) => {
    events.push(value);
  });
  await fetch('https://public.example/path?token=SECRET', {
    headers: { authorization: 'SECRET' },
  });
  expect(requests[0]?.get('authorization')).toBe('SECRET');
  expect(requests[0]?.get('accept')).toBe('application/json');
  expect(requests[0]?.get('host')).toBe('public.example');
  await expect(fetch('https://private.example')).rejects.toThrow();
  expect(requests).toHaveLength(1);
  expect(events).toEqual([
    {
      service: 'email-api',
      host: 'public.example',
      status: 204,
      durationMs: expect.any(Number),
    },
    {
      service: 'email-api',
      host: 'private.example',
      status: null,
      durationMs: expect.any(Number),
    },
  ]);
});

test('HTTP denial reports failure without fetching and empty hooks preserve request identity', async () => {
  const hooks = new HookBus({
    timeoutMs: 100,
    logger: { info() {}, warn() {}, error() {} },
  });
  const request = new Request('https://public.example');
  const init = { headers: { authorization: 'secret' } };
  let calls = 0;
  const fetch = hookFetch(hooks, 'email-api', async (input, options) => {
    expect(input).toBe(request);
    expect(options).toBe(init);
    calls++;

    return new Response(null, { status: 204 });
  });

  await fetch(request, init);
  hooks
    .registrar('deny')
    .filter('http.requestAllowed', (value) => ({ ...value, allowed: false }));
  const events: unknown[] = [];

  hooks.registrar('observe').on('http.responded', (value) => {
    events.push(value);
  });
  await expect(fetch(request, init)).rejects.toThrow();
  expect(calls).toBe(1);
  expect(events).toEqual([
    {
      service: 'email-api',
      host: 'public.example',
      status: null,
      durationMs: expect.any(Number),
    },
  ]);
});
