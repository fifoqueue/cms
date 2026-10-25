import { expect, test } from 'bun:test';
import type { SignInMethodDefinition } from '@cms/sdk/plugin';
import { SignInRegistry } from '#api/plugin-runtime/sign-in-registry';

test('core calls are not timed out and core errors propagate; plugin calls remain isolated', async () => {
  const warnings: unknown[] = [];
  const registry = new SignInRegistry({
    timeoutMs: 2,
    logger: {
      info() {},
      error() {},
      warn: (...args) => {
        warnings.push(args);
      },
    },
  });
  const users = { findById: async () => null, findByEmail: async () => null };
  const method: SignInMethodDefinition = {
    label: 'Core',
    usableBy: () => true,
    ready: async () => {
      await Bun.sleep(15);
      return true;
    },
    begin: () => {
      throw new Error('core failure');
    },
  };
  registry.core(users).signInMethod('password', method);
  registry.registrar('example', users).signInMethod('method', method);
  registry.registrar('core', users).signInMethod('password', method);
  expect(await registry.method('password')!.ready!()).toBe(true);
  const request = { option: null, values: {}, address: null, callbackUrl: '' };
  await expect(registry.method('password')!.begin(request)).rejects.toThrow(
    'core failure',
  );
  expect(await registry.method('plugin:example:method')!.ready!()).toBe(false);
  expect(
    await registry.method('plugin:example:method')!.begin(request),
  ).toEqual({ kind: 'failed' });
  expect(await registry.method('plugin:core:password')!.begin(request)).toEqual(
    { kind: 'failed' },
  );
  expect(warnings).toHaveLength(3);
});

test('core and plugin registrations are isolated and revoked', async () => {
  const warnings: unknown[] = [];
  const registry = new SignInRegistry({
    timeoutMs: 5,
    logger: {
      info() {},
      error() {},
      warn: (...args) => {
        warnings.push(args);
      },
    },
  });
  const users = { findById: async () => null, findByEmail: async () => null };
  const method: SignInMethodDefinition = {
    label: 'Example',
    usableBy: () => true,
    begin: () => ({ kind: 'user', userId: 'u1' }),
  };
  registry.core(users).signInMethod('password', method);
  const release = registry
    .registrar('example', users)
    .signInMethod('test', method);
  const held = registry.method('plugin:example:test')!;
  const request = {
    values: {},
    option: null,
    address: null,
    callbackUrl: 'https://example.com',
  };
  expect(await held.begin(request)).toEqual({ kind: 'user', userId: 'u1' });
  release();
  expect(await held.begin(request)).toEqual({ kind: 'failed' });
  expect(registry.method('password')).toBeDefined();
  registry.registrar('example', users).signInMethod('invalid', {
    ...method,
    begin: () => ({ kind: 'user', userId: '' }),
  });
  expect(
    await registry.method('plugin:example:invalid')!.begin(request),
  ).toEqual({ kind: 'failed' });
  registry.registrar('example', users).signInMethod('slow', {
    ...method,
    ready: () => new Promise(() => {}),
  });
  expect(await registry.method('plugin:example:slow')!.ready!()).toBe(false);
  expect(warnings).toHaveLength(2);
  registry.revoke('example');
  expect((await registry.available()).methods.map((entry) => entry.id)).toEqual(
    ['password'],
  );
});
