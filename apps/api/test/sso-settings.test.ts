import { expect, test } from 'bun:test';
import { SsoSettingsService } from '#api/domain/auth/sso-settings';
import { createSsoMethod } from '#api/domain/auth/sso-method';
import type { OidcClient } from '#api/domain/auth/sso-settings';
import type { OidcProvider } from '#api/domain/auth/sso-ports';
import type { DomainError } from '#api/shared/errors';
import { MemorySettings, profile } from '#test/support/memory';
import {
  createMemoryAuthStore,
  MemorySsoAccessTransactions,
} from '#test/support/sso-memory';
import { plainSecretBox } from '#test/support/memory-security';

const setup = (
  siteUrl = 'https://site.example',
  otherMethod = async () => true,
) => {
  const clients: OidcClient[] = [];
  const settings = new MemorySettings();
  const { identities } = createMemoryAuthStore();
  const service = new SsoSettingsService({
    otherMethod,
    settings,
    access: new MemorySsoAccessTransactions({ settings, identities }),
    secrets: plainSecretBox,
    siteUrl: async () => siteUrl,
    connect: (client) => {
      clients.push(client);
      return {
        authorize: async () => ({
          url: `https://id.example.com/authorize?redirect_uri=${encodeURIComponent(client.redirectUri)}`,
          state: 'state',
          nonce: 'nonce',
          codeVerifier: 'verifier',
        }),
        verify: async () => ({ issuer: client.issuer, subject: 'subject' }),
      };
    },
    environment: null,
  });
  return { service, clients, settings, identities };
};

const input = {
  id: 'default',
  enabled: true,
  issuer: 'https://id.example.com',
  clientId: 'cms',
  clientSecret: 'top-secret',
  allowedSubjects: { 'sub-1': 'Admin@Example.com' },
};
const actor = profile({ id: 'admin', email: 'admin@example.com' });
const update = (service: SsoSettingsService, provider = input) =>
  service.update({ passwordLogin: true, providers: [provider] }, actor);

test('admin settings turn single sign-on on without the environment, never returning the secret', async () => {
  const { service, clients } = setup();
  expect((await service.setup()).providers).toEqual([]);

  const saved = await update(service);
  expect(saved).toMatchObject({
    providers: [{ clientSecretConfigured: true }],
    redirectUri: 'https://site.example/admin/sso/callback',
    environmentProvider: null,
  });
  expect(JSON.stringify(await service.getAdmin())).not.toContain('top-secret');

  const active = await service.setup();
  expect(active.providers).toHaveLength(1);
  expect(active.providers[0]!.subjects.get('sub-1')).toBe('admin@example.com');
  // The provider client is reused until the settings change.
  await service.setup();
  expect(clients).toHaveLength(1);
  expect(clients[0]).toMatchObject({
    clientSecret: 'top-secret',
    scope: 'openid',
    redirectUri: 'https://site.example/admin/sso/callback',
  });
  const { clientSecret: _secret, ...kept } = input;
  await service.update(
    { passwordLogin: true, providers: [{ ...kept, name: 'Company' }] },
    actor,
  );
  await service.setup();
  expect(clients).toHaveLength(1);
  await update(service, { ...input, clientSecret: 'rotated' });
  await service.setup();
  expect(clients).toHaveLength(2);
});

test('changing issuer never silently carries its old client secret', async () => {
  const { service } = setup();
  await update(service);
  for (const clientSecret of [undefined, '']) {
    await expect(
      service.update(
        {
          passwordLogin: true,
          providers: [
            {
              ...input,
              issuer: 'https://different.example',
              clientSecret,
            },
          ],
        },
        actor,
      ),
    ).rejects.toMatchObject({
      issues: [
        { path: 'providers.0.clientSecret', message: expect.any(String) },
      ],
    });
  }
  await service.update(
    {
      passwordLogin: true,
      providers: [
        {
          ...input,
          issuer: `${input.issuer}/`,
          clientSecret: undefined,
        },
      ],
    },
    actor,
  );
  expect((await service.getAdmin()).providers[0]!.clientSecretConfigured).toBe(
    true,
  );
});

test('turning it on needs a client secret (unless none) and the site address', async () => {
  const code = (promise: Promise<unknown>) =>
    promise.then(
      () => 'ok',
      (error: DomainError) => error.code,
    );
  expect(
    await code(update(setup().service, { ...input, clientSecret: '' })),
  ).toBe('invalid_input');
  expect(
    await code(
      setup().service.update(
        {
          passwordLogin: true,
          providers: [
            {
              ...input,
              clientSecret: '',
              authMethod: 'none',
            },
          ],
        },
        actor,
      ),
    ),
  ).toBe('ok');
  expect(await code(update(setup('').service))).toBe('invalid_input');
});

test('legacy settings migrate on read without losing the secret or subject bytes', async () => {
  const { service, settings } = setup();
  await settings.set('sso', {
    settings: { ...input, allowedSubjects: { 'Alice ': actor.email } },
    clientSecret: 'sealed:legacy-secret',
  });
  expect(await service.getAdmin()).toMatchObject({
    providers: [
      {
        id: 'default',
        clientSecretConfigured: true,
        allowedSubjects: { 'Alice ': actor.email },
      },
    ],
  });
  expect((await service.setup()).providers[0]!.subjects.has('Alice ')).toBe(
    true,
  );
});

test('without another usable method, provider edits preserve the acting administrator’s access', async () => {
  const { service } = setup('https://site.example', async () => false);
  await expect(
    service.update({ passwordLogin: false, providers: [] }, actor),
  ).rejects.toMatchObject({
    code: 'invalid_input',
    issues: [{ path: 'providers' }],
  });
  await expect(
    service.update(
      { passwordLogin: false, providers: [{ ...input, allowedSubjects: {} }] },
      actor,
    ),
  ).rejects.toMatchObject({ code: 'invalid_input' });
  await service.update({ passwordLogin: false, providers: [input] }, actor);
  expect(await service.getAdmin()).not.toHaveProperty('passwordLogin');
  await expect(
    service.update(
      { passwordLogin: false, providers: [{ ...input, enabled: false }] },
      actor,
    ),
  ).rejects.toMatchObject({ code: 'invalid_input' });
});

test('secrets follow provider ids rather than display order and removed ids lose their secret', async () => {
  const { service, clients } = setup();
  await service.update(
    {
      passwordLogin: true,
      providers: [
        input,
        { ...input, id: 'second', clientSecret: 'second-secret' },
      ],
    },
    actor,
  );
  const { clientSecret: _secret, ...kept } = input;
  await service.update(
    { passwordLogin: true, providers: [{ ...kept, id: 'second' }, kept] },
    actor,
  );
  await service.setup();
  expect(clients.map((client) => client.clientSecret)).toEqual([
    'second-secret',
    'top-secret',
  ]);
  await service.update({ passwordLogin: true, providers: [kept] }, actor);
  await expect(
    service.update(
      { passwordLogin: true, providers: [{ ...kept, id: 'second' }] },
      actor,
    ),
  ).rejects.toMatchObject({ code: 'invalid_input' });
});

test('environment replaces the provider list but not stored password policy', async () => {
  const settings = new MemorySettings();
  const { identities } = createMemoryAuthStore();
  const environment = {
    id: 'environment',
    name: 'Environment',
    issuer: 'https://env.example',
    provider: {} as OidcProvider,
    subjects: new Map([['assigned', actor.email]]),
  };
  const service = new SsoSettingsService({
    settings,
    otherMethod: async () => true,
    secrets: plainSecretBox,
    siteUrl: async () => 'https://site.example',
    access: new MemorySsoAccessTransactions({ settings, identities }),
    connect: () => {
      throw new Error('Stored providers must not connect');
    },
    environment,
    environmentRedirectUri: 'https://configured.example/oidc/callback',
  });
  await service.update({ passwordLogin: false, providers: [input] }, actor);
  expect(await service.setup()).toEqual({
    providers: [environment],
  });
  expect(await service.getAdmin()).toMatchObject({
    environmentProvider: { id: 'environment', name: 'Environment' },
    redirectUri: 'https://configured.example/oidc/callback',
  });
});

test('SSO login and claim preserve the managed callback already registered at the provider', async () => {
  const { service, clients, identities } = setup();
  await update(service);
  const method = createSsoMethod({
    setup: () => service.setup(),
    identities,
    resolve: async () => null,
    ids: { next: () => 'identity' },
    clock: { now: () => new Date('2026-01-01') },
    starts: { tryAcquire: () => true },
  });
  const request = {
    option: 'default',
    values: {},
    address: null,
    callbackUrl: 'https://site.example/admin/sign-in/callback',
  };
  for (const step of [
    await method.begin(request),
    await method.setup!.begin(actor, request),
  ]) {
    if (step.kind !== 'redirect') throw new Error('Expected redirect');
    expect(new URL(step.url).searchParams.get('redirect_uri')).toBe(
      'https://site.example/admin/sso/callback',
    );
  }
  expect(clients).toHaveLength(1);
  expect((await service.getAdmin()).redirectUri).toBe(clients[0]!.redirectUri);
});

test('saving providers preserves a legacy SSO-only policy and ignores the incoming legacy flag', async () => {
  const { service, settings } = setup();
  await settings.set('sso', {
    settings: { passwordLogin: false, providers: [] },
    secrets: {},
  });
  await service.update({ passwordLogin: true, providers: [input] }, actor);
  expect(await settings.get('signIn')).toMatchObject({ methods: ['sso'] });
  expect(await settings.get('sso')).toMatchObject({
    settings: { providers: expect.any(Array) },
  });
  expect(JSON.stringify(await service.getAdmin())).not.toContain(
    'passwordLogin',
  );
  expect(JSON.stringify(await settings.get('sso'))).not.toContain(
    'passwordLogin',
  );
});
