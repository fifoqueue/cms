import { expect, test } from 'bun:test';
import { createApiApp, createInstallerApp } from '#api/http/app';
import type { ApiServices, InstallerServices } from '#api/http/services';
import { ClientResolver } from '#api/http/client-identity';
import { HookBus } from '#api/plugin-runtime/hook-bus';
import { profile } from '#test/support/memory';

test('credential responses stay private before filters and without handlers', async () => {
  const logger = { info() {}, warn() {}, error() {} };
  const hooks = new HookBus({ timeoutMs: 100, logger });
  const credential = { token: 'private-token' };
  const grant = async () => credential;
  const user = profile({ id: 'admin' });
  const app = await createApiApp({
    logger,
    services: {
      renderHooks: hooks,
      clients: new ClientResolver(undefined),
      auth: { authenticate: async () => user, requireRecent: async () => {} },
      publicContent: { unlock: grant },
      recovery: { recover: grant, generate: grant },
      apiTokens: { create: grant },
      signIn: {
        start: grant,
        setup: grant,
        continue: grant,
        chooseFactor: grant,
        enroll: grant,
      },
      sso: { complete: grant },
      passwords: { reset: async () => {} },
      privacy: { confirm: async () => {} },
      previews: { create: grant },
      themePreviews: { issue: grant },
      webhooks: { create: grant, rotate: grant },
      frontendSecret: 'private-secret',
    } as unknown as ApiServices,
  });
  const paths = [
    '/api/v1/unlock/entry',
    '/api/v1/auth/recovery',
    '/api/v1/auth/recovery-codes',
    '/api/v1/auth/tokens',
    '/api/v1/auth/sign-in/password',
    '/api/v1/auth/sign-in/setup/password',
    '/api/v1/auth/sign-in/continue',
    '/api/v1/auth/sign-in/factor',
    '/api/v1/auth/factors/totp/enroll',
    '/api/v1/auth/sso/callback',
    '/api/v1/auth/password/reset',
    '/api/v1/privacy/confirm',
    '/api/v1/admin/content/entry/preview',
    '/api/v1/admin/themes/theme/preview',
    '/api/v1/admin/webhooks',
    '/api/v1/admin/webhooks/hook/rotate',
    '/api/v1/admin/frontend-secret',
  ];

  for (const filtered of [false, true]) {
    if (filtered)
      hooks.registrar('cache').filter('api.responseHeaders', (value) => ({
        ...value,
        headers: { ...value.headers, 'cache-control': 'public, max-age=3600' },
      }));

    for (const path of paths) {
      const response = await app.handle(
        new Request(`http://localhost${path}`, {
          method: path.endsWith('frontend-secret') ? 'GET' : 'POST',
          headers: {
            'content-type': 'application/json',
            ...(path.includes('/admin/') ||
            path.includes('/factors/') ||
            path.endsWith('recovery-codes') ||
            path.endsWith('/tokens')
              ? { authorization: 'Bearer admin' }
              : {}),
          },
          body: path.endsWith('frontend-secret') ? undefined : '{}',
        }),
      );

      expect(response.status, path).toBeLessThan(300);
      expect(response.headers.get('cache-control'), path).toContain('no-store');
      expect(response.headers.get('cache-control'), path).not.toContain(
        'public',
      );
    }
  }

  const installer = await createInstallerApp({
    logger,
    services: {
      installation: { complete: grant },
    } as unknown as InstallerServices,
  });
  const response = await installer.handle(
    new Request('http://localhost/api/v1/install/complete', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    }),
  );

  expect(response.status).toBe(201);
  expect(response.headers.get('cache-control')).toBe('private, no-store');
});
