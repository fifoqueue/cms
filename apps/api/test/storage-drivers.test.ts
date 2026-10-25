import { expect, test } from 'bun:test';
import { StorageDrivers } from '#api/domain/media/storage-drivers';
import type { MediaStorage } from '#api/domain/media/ports';
import { createRuntime } from '#test/support/runtime';
import { definePlugin } from '@cms/sdk/plugin';
import { StorageSettings } from '#api/domain/media/storage-settings';

const storage = (): MediaStorage => ({
  commit: async () => 'stored',
  read: async () => null,
  remove: async () => undefined,
});

test('plugin runtime registers declared storage settings, seals secrets and revokes captured drivers', async () => {
  const drivers = new StorageDrivers();
  const runtime = createRuntime({ storageDrivers: drivers });
  let secret = '';
  const plugin = definePlugin({
    manifest: { id: 'storage-test', name: 'Storage', version: '1.0.0' },
    activate(context) {
      expect('registerCore' in context.storageDrivers).toBe(false);
      context.storageDrivers.register('remote', {
        label: 'Remote',
        fields: [
          { key: 'token', label: 'Token', type: 'secret', required: true },
        ],
        connect(values) {
          secret = String(values.token);
          return storage();
        },
      });
    },
  });
  await runtime.host.install(runtime.bundles.register('storage', plugin));
  await runtime.host.enable('storage-test');
  const values = new Map<string, unknown>();
  const store = {
    get: async (key: string) => structuredClone(values.get(key)),
    set: async (key: string, value: unknown) => {
      values.set(key, structuredClone(value));
    },
    list: async () => Object.fromEntries(values),
    count: async () => values.size,
  };
  const settings = new StorageSettings({
    drivers,
    settings: store,
    transactions: { run: async (_key, task) => task(store) },
    secrets: {
      seal: (value) => `sealed:${value}`,
      open: (value) => value.slice(7),
    },
    test: async () => undefined,
  });
  const saved = await settings.update({
    driver: 'plugin:storage-test:remote',
    s3: null,
    pluginSettings: { token: 'credential' },
  });
  await expect(
    settings.test({
      driver: 'plugin:storage-test:remote',
      s3: null,
      pluginSettings: { token: '' },
    }),
  ).rejects.toMatchObject({
    code: 'invalid_input',
    issues: [
      {
        path: 'pluginSettings.token',
        message: 'This storage field is required',
      },
    ],
  });
  expect(saved.availableDrivers?.map(({ id }) => id)).toContain(
    'plugin:storage-test:remote',
  );
  expect(JSON.stringify(saved)).not.toContain('credential');
  expect(saved.pluginSecretsConfigured).toEqual(['token']);
  const config = await settings.configuration();
  const captured = drivers.get(config.driver, config.pluginSettings)!;
  await captured.read('test');
  expect(secret).toBe('credential');
  await settings.update({ driver: 'local', s3: null });
  expect(
    (await settings.configuration('plugin:storage-test:remote')).pluginSettings
      ?.token,
  ).toBe('credential');
  await runtime.host.disable('storage-test');
  expect(drivers.get(config.driver)).toBeNull();
  await expect(captured.commit([], 0)).rejects.toThrow();
  expect(
    (await settings.get()).availableDrivers?.map(({ id }) => id),
  ).not.toContain(config.driver);
});

test('plugin disposal preserves core ownership and never redirects orphaned media', async () => {
  const drivers = new StorageDrivers();
  const local = storage();
  const remote = storage();
  drivers.registerCore('local', local);
  const registrar = drivers.registrar('archive');
  expect('registerCore' in registrar).toBe(false);
  const dispose = registrar.register('local', remote);
  expect(drivers.get('local')).toBe(local);
  const captured = drivers.get('plugin:archive:local')!;
  expect(await captured.commit([], 0)).toBe('stored');
  dispose();
  dispose();
  expect(drivers.get('plugin:archive:local')).toBeNull();
  expect(drivers.get('local')).toBe(local);
  await expect(captured.read('orphan')).rejects.toThrow();
  expect(() => drivers.registerCore('local', remote)).toThrow();
});

test('removing a duplicate plugin registration restores the earlier driver', async () => {
  const drivers = new StorageDrivers();
  const registrar = drivers.registrar('archive');
  const first = storage();
  const second = storage();
  second.commit = async () => 'low_space';
  registrar.register('remote', first);
  const dispose = registrar.register('remote', second);
  expect(await drivers.get('plugin:archive:remote')!.commit([], 0)).toBe(
    'low_space',
  );
  dispose();
  expect(await drivers.get('plugin:archive:remote')!.commit([], 0)).toBe(
    'stored',
  );
});
