import { expect, test } from 'bun:test';
import { createApiApp, createInstallerApp } from '#api/http/app';
import type { ApiServices, InstallerServices } from '#api/http/services';
import { ClientResolver } from '#api/http/client-identity';
import { HookBus } from '#api/plugin-runtime/hook-bus';

test('real health, authentication and installer routes bypass both API filters', async () => {
  const logger = { info() {}, warn() {}, error() {} };
  const hooks = new HookBus({ timeoutMs: 100, logger });
  const seen: string[] = [];
  const registrar = hooks.registrar('test');

  registrar.filter('api.requestAllowed', (value) => {
    seen.push(value.path);

    return { ...value, allowed: false };
  });
  registrar.filter('api.responseHeaders', (value) => {
    seen.push(value.path);

    return { ...value, headers: { ...value.headers, 'x-hook': 'called' } };
  });
  const app = await createApiApp({
    logger,
    services: {
      renderHooks: hooks,
      clients: new ClientResolver(undefined),
      auth: { authenticate: async () => null },
      signIn: {
        info: async () => ({}),
        start: async () => ({}),
        setup: async () => ({}),
      },
      sso: { complete: async () => ({}) },
      privacy: { publicSettings: async () => ({}) },
    } as unknown as ApiServices,
  });

  for (const [method, path] of [
    ['GET', '/api/health'],
    ['GET', '/api/v1/auth/sign-in'],
    ['POST', '/api/v1/auth/sign-in/password'],
    ['POST', '/api/v1/auth/sign-in/setup/password'],
    ['POST', '/api/v1/auth/sso/callback'],
  ]) {
    const response = await app.handle(
      new Request(`http://localhost${path}`, {
        method,
        headers: { 'content-type': 'application/json' },
        body: method === 'POST' ? '{}' : undefined,
      }),
    );

    expect(response.status, path).toBe(200);
    expect(response.headers.has('x-hook'), path).toBe(false);
  }

  const installer = await createInstallerApp({
    logger,
    services: {
      installation: { complete: async () => ({ token: 'session' }) },
    } as unknown as InstallerServices,
  });
  const installed = await installer.handle(
    new Request('http://localhost/api/v1/install/complete', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    }),
  );

  expect(installed.status).toBe(201);
  expect(seen).toEqual([]);
  expect(
    (await app.handle(new Request('http://localhost/api/v1/privacy'))).status,
  ).toBe(403);
  expect(seen).toContain('/api/v1/privacy');
});
