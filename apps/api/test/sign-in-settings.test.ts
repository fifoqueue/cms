import { expect, test } from 'bun:test';
import { DEFAULT_SIGN_IN_SETTINGS } from '@cms/sdk';
import { SignInSettingsService } from '#api/domain/auth/sign-in-settings';
import { SignInRegistry } from '#api/plugin-runtime/sign-in-registry';
import { MemorySettings, profile, recordingLogger } from '#test/support/memory';

const setup = (passwordForced = false) => {
  const settings = new MemorySettings();
  const { logger } = recordingLogger();
  const registry = new SignInRegistry({ timeoutMs: 50, logger });
  const core = registry.core({
    findById: async () => null,
    findByEmail: async () => null,
  });
  core.signInMethod('password', {
    label: 'Password',
    usableBy: () => true,
    begin: () => ({ kind: 'failed' }),
  });
  const service = new SignInSettingsService({
    settings,
    transactions: settings,
    registry,
    passwordForced,
    logger,
  });
  return { service, settings, registry, core, logger };
};

test('defaults, legacy migration and explicit policy precedence', async () => {
  const { service, settings } = setup();
  expect((await service.getAdmin()).methods).toEqual(
    DEFAULT_SIGN_IN_SETTINGS.methods,
  );
  await settings.set('sso', { settings: { passwordLogin: false } });
  expect((await service.getAdmin()).methods).toEqual(['sso']);
  await settings.set('signIn', {
    ...DEFAULT_SIGN_IN_SETTINGS,
    methods: ['password'],
  });
  expect((await service.getAdmin()).methods).toEqual(['password']);
});

test('validation, unknown ids, capability and lockout guards', async () => {
  const { service, settings, core } = setup();
  const actor = profile({ id: 'admin' });
  await expect(
    service.update({ ...DEFAULT_SIGN_IN_SETTINGS, methods: [] }, actor),
  ).rejects.toMatchObject({ code: 'invalid_input' });
  await expect(
    service.update(
      { ...DEFAULT_SIGN_IN_SETTINGS, methods: ['plugin:unknown:method'] },
      actor,
    ),
  ).rejects.toMatchObject({ code: 'invalid_input' });
  await expect(
    service.update(
      DEFAULT_SIGN_IN_SETTINGS,
      profile({ id: 'reader', role: 'subscriber' }),
    ),
  ).rejects.toMatchObject({ code: 'forbidden' });
  core.signInMethod('sso', {
    label: 'SSO',
    usableBy: () => false,
    begin: () => ({ kind: 'failed' }),
  });
  await expect(
    service.update({ ...DEFAULT_SIGN_IN_SETTINGS, methods: ['sso'] }, actor),
  ).rejects.toMatchObject({
    issues: [{ path: 'methods', message: expect.any(String) }],
  });
  expect(await settings.get('signIn')).toBeUndefined();
  expect(
    (
      await service.update(
        { ...DEFAULT_SIGN_IN_SETTINGS, methods: ['password'] },
        actor,
      )
    ).methods,
  ).toEqual(['password']);
});

test('inactive stored ids survive, unavailable methods fall back, forced password is effective only', async () => {
  const { service, settings } = setup(true);
  const policy = {
    ...DEFAULT_SIGN_IN_SETTINGS,
    methods: ['plugin:removed:method'],
    secondFactors: ['plugin:removed:factor'],
  };
  await settings.set('signIn', policy);
  expect(
    (await service.update(policy, profile({ id: 'admin' }))).methods,
  ).toEqual(policy.methods);
  expect((await service.getAdmin()).passwordForced).toBe(true);
  expect((await service.effective()).methods).toEqual(['password']);
  expect((await service.effective()).secondFactors).toEqual([]);
  const fallback = setup();
  await fallback.settings.set('signIn', policy);
  expect((await fallback.service.effective()).methods).toEqual(['password']);
});

test('unready methods fail the guard and forced password is added without changing storage', async () => {
  const { service, settings, core } = setup();
  core.signInMethod('sso', {
    label: 'SSO',
    ready: () => false,
    usableBy: () => true,
    begin: () => ({ kind: 'failed' }),
  });
  const policy = { ...DEFAULT_SIGN_IN_SETTINGS, methods: ['sso'] };
  await expect(
    service.update(policy, profile({ id: 'admin' })),
  ).rejects.toMatchObject({
    issues: [{ path: 'methods', message: expect.any(String) }],
  });
  await settings.set('signIn', policy);
  expect((await service.effective()).methods).toEqual(['password']);
  const forced = setup(true);
  forced.core.signInMethod('sso', {
    label: 'SSO',
    usableBy: () => true,
    begin: () => ({ kind: 'failed' }),
  });
  forced.registry.revoke('core');
  forced.core.signInMethod('sso', {
    label: 'SSO',
    usableBy: () => true,
    begin: () => ({ kind: 'failed' }),
  });
  await forced.settings.set('signIn', policy);
  expect((await forced.service.effective()).methods).toEqual([
    'sso',
    'password',
  ]);
  expect((await forced.service.getAdmin()).methods).toEqual(['sso']);
});

test('serialized saves cannot resurrect an unregistered id removed by the preceding save', async () => {
  const { service, settings } = setup();
  const old = {
    ...DEFAULT_SIGN_IN_SETTINGS,
    methods: ['password', 'plugin:removed:method'],
  };
  await settings.set('signIn', old);
  const results = await Promise.allSettled([
    service.update({ ...old, methods: ['password'] }, profile({ id: 'admin' })),
    service.update(old, profile({ id: 'admin' })),
  ]);
  expect(results[0]!.status).toBe('fulfilled');
  expect(results[1]).toMatchObject({
    status: 'rejected',
    reason: { code: 'invalid_input' },
  });
  expect((await service.getAdmin()).methods).toEqual(['password']);
});
