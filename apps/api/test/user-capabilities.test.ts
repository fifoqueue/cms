import { expect, test } from 'bun:test';
import type { Capability } from '@cms/sdk';
import {
  UserCapabilities,
  coreCapabilities,
} from '#api/domain/users/user-capabilities';
import { HookBus } from '#api/plugin-runtime/hook-bus';
import { recordingLogger } from '#test/support/memory';

const fixture = () => {
  const { logger, lines } = recordingLogger();
  const hooks = new HookBus({ timeoutMs: 10, logger });
  return {
    hooks,
    lines,
    resolver: new UserCapabilities(hooks, coreCapabilities, logger),
  };
};
const user = { id: 'writer', role: 'author' };

test('capability grants/revocations use verified identity and audit each plugin/user/grant once', async () => {
  const { hooks, lines, resolver } = fixture();
  hooks.registrar('access').filter('user.capabilities', (input) => {
    expect(input).toEqual({
      userId: user.id,
      role: user.role,
      capabilities: ['content.create'],
    });
    return { ...input, capabilities: ['users.manage'] };
  });
  expect(await resolver.resolve(user, ['content.create'])).toEqual([
    'users.manage',
  ]);
  expect(await resolver.resolve(user, ['content.create'])).toEqual([
    'users.manage',
  ]);
  expect(lines).toEqual([
    'warn Capability grant ["access","writer","users.manage"]',
  ]);
  expect(await resolver.resolve(null, ['users.manage'])).toEqual([]);
  expect(
    await resolver.resolve({ id: '', role: 'administrator' }, ['users.manage']),
  ).toEqual([]);
  expect(lines).toHaveLength(1);
});

test('unknown grants and identity changes are ignored; failed and removed filters preserve core capabilities', async () => {
  const { hooks, resolver, lines } = fixture();
  const original: Capability[] = ['content.create'];
  const remove = hooks
    .registrar('unknown')
    .filter('user.capabilities', (input) => ({
      ...input,
      capabilities: ['unknown.capability' as Capability],
    }));
  hooks
    .registrar('identity')
    .filter('user.capabilities', (input) => ({ ...input, userId: 'other' }));
  hooks.registrar('failure').filter('user.capabilities', () => {
    throw new Error('failed');
  });
  expect(await resolver.resolve(user, original)).toEqual(original);
  remove();
  expect(await resolver.resolve(user, original)).toEqual(original);
  expect(lines.some((line) => line.includes('Capability grant'))).toBe(false);
});

test('role-owned grants are not audited; different plugin and user grants are independent', async () => {
  const { hooks, resolver, lines } = fixture();
  const remove = hooks
    .registrar('one')
    .filter('user.capabilities', (input) => ({
      ...input,
      capabilities: ['users.manage'],
    }));
  await resolver.resolve(user, ['users.manage']);
  expect(lines).toEqual([]);
  await resolver.resolve(user, []);
  await resolver.resolve({ ...user, id: 'second' }, []);
  remove();
  hooks.registrar('two').filter('user.capabilities', (input) => ({
    ...input,
    capabilities: ['users.manage'],
  }));
  await resolver.resolve(user, []);
  expect(lines).toHaveLength(3);
});
