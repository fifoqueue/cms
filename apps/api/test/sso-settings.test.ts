import { expect, test } from 'bun:test';
import { SsoSettingsService } from '#api/domain/auth/sso-settings';
import type { OidcClient } from '#api/domain/auth/sso-settings';
import type { OidcProvider } from '#api/domain/auth/sso-ports';
import type { DomainError } from '#api/shared/errors';
import { MemorySettings } from '#test/support/memory';
import { plainSecretBox } from '#test/support/memory-security';

const setup = (siteUrl = 'https://site.example') => {
  const clients: OidcClient[] = [];
  const service = new SsoSettingsService({
    settings: new MemorySettings(),
    secrets: plainSecretBox,
    siteUrl: async () => siteUrl,
    connect: (client) => (clients.push(client), {} as OidcProvider),
    environment: null,
  });
  return { service, clients };
};

const input = {
  enabled: true,
  issuer: 'https://id.example.com',
  clientId: 'cms',
  clientSecret: 'top-secret',
  allowedSubjects: { 'sub-1': 'Admin@Example.com' },
};

test('admin settings turn single sign-on on without the environment, never returning the secret', async () => {
  const { service, clients } = setup();
  expect((await service.setup()).provider).toBeNull();

  const saved = await service.update(input);
  expect(saved).toMatchObject({
    clientSecretConfigured: true,
    redirectUri: 'https://site.example/admin/sso/callback',
    managedByEnvironment: false,
  });
  expect(JSON.stringify(await service.getAdmin())).not.toContain('top-secret');

  const active = await service.setup();
  expect(active.provider).not.toBeNull();
  expect(active.subjects.get('sub-1')).toBe('admin@example.com');
  // The provider client is reused until the settings change.
  await service.setup();
  expect(clients).toHaveLength(1);
  expect(clients[0]).toMatchObject({
    clientSecret: 'top-secret',
    scope: 'openid',
  });
  await service.update({ ...input, clientSecret: undefined, name: 'Company' });
  await service.setup();
  expect(clients).toHaveLength(1);
  await service.update({ ...input, clientSecret: 'rotated' });
  await service.setup();
  expect(clients).toHaveLength(2);
});

test('turning it on needs a client secret (unless none) and the site address', async () => {
  const code = (promise: Promise<unknown>) =>
    promise.then(
      () => 'ok',
      (error: DomainError) => error.code,
    );
  expect(
    await code(setup().service.update({ ...input, clientSecret: '' })),
  ).toBe('invalid_input');
  expect(
    await code(
      setup().service.update({
        ...input,
        clientSecret: '',
        authMethod: 'none',
      }),
    ),
  ).toBe('ok');
  expect(await code(setup('').service.update(input))).toBe('invalid_input');
});
