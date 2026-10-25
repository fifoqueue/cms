import { expect, test } from 'bun:test';
import { RoleService } from '#api/domain/users/role-service';
import { SecuritySettingsService } from '#api/domain/security/security-settings';
import { HookBus } from '#api/plugin-runtime/hook-bus';
import { DEFAULT_SECURITY_SETTINGS } from '@cms/sdk';
import { MemorySettings, recordingLogger } from '#test/support/memory';

test('role actions follow committed writes and include reassignment', async () => {
  const settings = new MemorySettings();
  const hooks = new HookBus({
    timeoutMs: 100,
    logger: recordingLogger().logger,
  });
  const events: unknown[] = [];
  const registrar = hooks.registrar('test');
  for (const name of ['role.created', 'role.updated', 'role.deleted'] as const)
    registrar.on(name, (value) => {
      events.push({ name, value });
    });
  const service = new RoleService(
    settings,
    {
      saveRole: async (role) => {
        await settings.set(`role.${role.key}`, role);
      },
      removeRole: async (key) => {
        await settings.set(`role.${key}`, null);
      },
    },
    hooks,
  );
  const actor = { id: 'admin', role: 'administrator' };
  const role = {
    key: 'staff',
    name: 'Staff',
    capabilities: [],
    source: 'admin',
  };
  await service.save(role, actor);
  await service.save(role, actor);
  await service.remove('staff', { reassignTo: 'subscriber' }, actor);
  expect(events).toEqual([
    { name: 'role.created', value: role },
    { name: 'role.updated', value: role },
    { name: 'role.deleted', value: { role, reassignTo: 'subscriber' } },
  ]);
  const failing = new RoleService(
    settings,
    {
      saveRole: async () => {
        throw new Error('write failed');
      },
      removeRole: async () => {},
    },
    hooks,
  );
  await expect(failing.save(role, actor)).rejects.toThrow('write failed');
  expect(events).toHaveLength(3);
});

test('security action exposes configuration flags, not secrets', async () => {
  const hooks = new HookBus({
    timeoutMs: 100,
    logger: recordingLogger().logger,
  });
  const events: unknown[] = [];
  hooks.registrar('test').on('security.updated', (value) => {
    events.push(value);
  });
  const service = new SecuritySettingsService(
    new MemorySettings(),
    {
      seal: (value) => `sealed:${value}`,
      open: (value) => value.slice(7),
    },
    hooks,
  );
  const result = await service.update({
    ...DEFAULT_SECURITY_SETTINGS,
    captcha: { ...DEFAULT_SECURITY_SETTINGS.captcha, secretKey: 'private-key' },
  });
  expect(events).toEqual([result]);
  expect(result.captcha.secretConfigured).toBe(true);
  expect(JSON.stringify(events)).not.toContain('private-key');
});
