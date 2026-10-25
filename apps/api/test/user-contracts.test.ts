import { expect, test } from 'bun:test';
import { ROLES } from '@cms/sdk';
import { RoleRegistry } from '#api/domain/users/role-registry';
import { RoleService } from '#api/domain/users/role-service';
import { ProfileFields } from '#api/domain/users/profile-fields';
import { ProfileMeta } from '#api/domain/users/profile-meta';
import { CaptchaRegistry } from '#api/domain/security/captcha-registry';
import { EraserRegistry } from '#api/domain/privacy/eraser-registry';
import { PluginScope } from '#api/plugin-runtime/plugin-scope';
import {
  MemorySettings,
  recordingLogger,
  userRecord,
} from '#test/support/memory';
import { MemoryProfileMeta } from '#test/support/memory-profile-meta';
import { MemoryUsers } from '#test/support/sso-memory';

test('contributed roles use the core registry; administrator overrides and tombstones win', async () => {
  const defaults = new RoleRegistry();
  expect(defaults.list().map((role) => role.key)).toEqual([...ROLES]);
  const definition = {
    key: 'reviewer',
    name: 'Reviewer',
    capabilities: ['content.create'],
  };
  const release = defaults.register(definition);
  definition.name = 'Mutated';
  const settings = new MemorySettings();
  const service = new RoleService(
    settings,
    {
      saveRole: async (role) => settings.set(`role.${role.key}`, role),
      removeRole: async (key) => settings.set(`role.${key}`, null),
    },
    undefined,
    undefined,
    undefined,
    defaults,
  );
  expect(
    (await service.list()).find((role) => role.key === 'reviewer')?.name,
  ).toBe('Reviewer');
  await service.save(
    { key: 'reviewer', name: 'Edited', capabilities: [] },
    { id: 'admin', role: 'administrator' },
  );
  expect(await service.capabilities('reviewer')).toEqual([]);
  release();
  expect(
    (await service.list()).find((role) => role.key === 'reviewer')?.name,
  ).toBe('Edited');
  defaults.register({
    key: 'reviewer',
    name: 'Returned',
    capabilities: ['content.create'],
  });
  await service.remove(
    'reviewer',
    { reassignTo: 'subscriber' },
    { id: 'admin', role: 'administrator' },
  );
  expect((await service.list()).some((role) => role.key === 'reviewer')).toBe(
    false,
  );
  expect(() =>
    defaults.register({ key: 'bad key', name: 'Bad', capabilities: [] }),
  ).toThrow();
});

test('profile declarations validate per-user metadata and deactivation preserves private stored data', async () => {
  const fields = new ProfileFields();
  const scope = new PluginScope();
  scope.track(() =>
    fields.register('preferences', 'color', {
      type: 'text',
      label: 'Color',
      maxLength: 8,
    }),
  );
  fields.register('preferences', 'age', {
    type: 'number',
    label: 'Age',
    min: 0,
    max: 150,
  });
  fields.register('preferences', 'consent', {
    type: 'boolean',
    label: 'Consent',
  });
  const users = new MemoryUsers();
  await users.insert(userRecord({ id: 'one' }));
  const store = new MemoryProfileMeta(users);
  const service = new ProfileMeta(fields, store);
  await service.save('one', {
    'preferences:color': 'blue',
    'preferences:age': 42,
    'preferences:consent': true,
  });
  expect((await service.get('two')).values).toEqual({});
  await expect(
    service.save('one', { 'preferences:color': 'a very long color' }),
  ).rejects.toThrow();
  await expect(
    service.save('one', { 'preferences:age': -1 }),
  ).rejects.toThrow();
  await expect(
    service.save('one', { 'preferences:consent': 'yes' }),
  ).rejects.toThrow();
  await expect(
    service.save('one', { 'unknown:field': true }),
  ).rejects.toThrow();
  scope.dispose();
  expect((await service.get('one')).values).toEqual({
    'preferences:age': 42,
    'preferences:consent': true,
  });
  expect(store.rows.get('one')?.['preferences:color']).toBe('blue');
  await expect(service.save('missing', {})).rejects.toMatchObject({
    code: 'not_found',
  });
});

const verification = {
  provider: 'turnstile',
  token: 'token',
  secret: 'secret',
  address: null,
  minimumScore: 0.5,
};
test('captcha core and plugins share registration; exceptions, invalid values, timeout and disposal fall back', async () => {
  const { logger } = recordingLogger();
  const registry = new CaptchaRegistry({ timeoutMs: 10, logger });
  registry.registerCore('turnstile', {
    label: 'Core',
    verify: async () => true,
  });
  const remove = registry.register('turnstile', {
    label: 'Reject',
    verify: async () => false,
  });
  expect(await registry.verify(verification)).toBe(false);
  remove();
  registry.register('turnstile', {
    label: 'Broken',
    verify: async () => {
      throw new Error('failed');
    },
  });
  registry.register('turnstile', {
    label: 'Invalid',
    verify: async () => 'yes' as never,
  });
  registry.register('turnstile', {
    label: 'Slow',
    verify: () => new Promise(() => {}),
  });
  expect(await registry.verify(verification)).toBe(true);
  const release = registry.register('plugin:extra:challenge', {
    label: 'New challenge',
    verify: async () => true,
  });
  expect(
    await registry.verify({
      ...verification,
      provider: 'plugin:extra:challenge',
    }),
  ).toBe(true);
  release();
  expect(
    await registry.verify({
      ...verification,
      provider: 'plugin:extra:challenge',
    }),
  ).toBe(false);
});

test('erasers isolate plugins, validate results, and never bypass core safeguards', async () => {
  const registry = new EraserRegistry({
    timeoutMs: 10,
    logger: recordingLogger().logger,
  });
  const calls: string[] = [];
  const request = {
    id: 'request',
    email: 'subject@example.com',
    action: 'erase' as const,
    status: 'confirmed' as const,
    createdAt: 'now',
    expiresAt: 'later',
    confirmedAt: 'now',
    completedAt: null,
  };
  registry.registerCore('personal-data', {
    erase: async () => {
      calls.push('core');
      return { erased: 1, retained: 0 };
    },
  });
  registry.register('orders', 'history', {
    erase: async (subject) => {
      expect(subject.email).toBe(request.email);
      subject.email = 'mutated';
      calls.push('plugin');
      return { erased: 3, retained: 2 };
    },
  });
  registry.register('invalid', 'result', {
    erase: async () => ({ erased: -1, retained: 0 }),
  });
  registry.register('slow', 'result', { erase: () => new Promise(() => {}) });
  const remove = registry.register('disabled', 'result', {
    erase: async () => {
      throw new Error('must not run');
    },
  });
  remove();
  const report = await registry.erase(request);
  expect(calls).toEqual(['core', 'plugin']);
  expect(request.email).toBe('subject@example.com');
  expect(report.results['orders:history']).toEqual({
    erased: 3,
    retained: 2,
    messages: [],
  });
  expect(report.failed).toEqual(['invalid:result', 'slow:result']);
  const refusing = new EraserRegistry({
    timeoutMs: 10,
    logger: recordingLogger().logger,
  });
  refusing.registerCore('personal-data', {
    erase: async () => {
      throw new Error('last administrator');
    },
  });
  refusing.register('orders', 'history', {
    erase: async () => {
      throw new Error('must not run');
    },
  });
  await expect(refusing.erase(request)).rejects.toThrow('last administrator');
});
