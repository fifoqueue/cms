import { expect, test } from 'bun:test';
import { CAPABILITIES } from '@cms/sdk';
import { CapabilityRegistry } from '#api/domain/users/capability-registry';

test('core and plugin capability declarations share validation, snapshots and revocation', () => {
  const registry = new CapabilityRegistry();
  expect(registry.list().map((entry) => entry.key)).toEqual([...CAPABILITIES]);
  const definition = { key: 'orders.manage', label: 'Manage orders' };
  const remove = registry.register(definition);
  definition.label = 'Mutated';
  expect(registry.has('orders.manage')).toBe(true);
  expect(
    registry.list().find((entry) => entry.key === 'orders.manage')?.label,
  ).toBe('Manage orders');
  registry.list()[0]!.label = 'Mutated';
  expect(registry.list()[0]!.label).toBe(CAPABILITIES[0]);
  remove();
  remove();
  expect(registry.has('orders.manage')).toBe(false);
  expect(() =>
    registry.register({ key: 'invalid', label: 'Invalid' }),
  ).toThrow();
  expect(() =>
    registry.register({ key: 'orders.manage', label: '' }),
  ).toThrow();
});

test('plugins cannot shadow a core label and duplicate declarations remain until both revoke', () => {
  const registry = new CapabilityRegistry();
  const removeCoreShadow = registry.register({
    key: 'users.manage',
    label: 'Changed',
  });
  expect(
    registry.list().find((entry) => entry.key === 'users.manage')?.label,
  ).toBe('users.manage');
  removeCoreShadow();
  expect(registry.has('users.manage')).toBe(true);
  const first = registry.register({ key: 'orders.manage', label: 'First' });
  const second = registry.register({ key: 'orders.manage', label: 'Second' });
  first();
  expect(
    registry.list().find((entry) => entry.key === 'orders.manage')?.label,
  ).toBe('Second');
  second();
  expect(registry.has('orders.manage')).toBe(false);
});
