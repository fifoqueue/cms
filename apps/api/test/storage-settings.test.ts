import { expect, test } from 'bun:test';
import { StorageSettings } from '#api/domain/media/storage-settings';
import { Errors } from '@cms/sdk/errors';
import { StorageDrivers } from '#api/domain/media/storage-drivers';
import { MemorySettings, recordingLogger } from '#test/support/memory';
import { HookBus } from '#api/plugin-runtime/hook-bus';

test('plugin storage validates once without filters and rejects changed driver ids', async () => {
  let validations = 0;
  let opens = 0;

  class Drivers extends StorageDrivers {
    override validate(...args: Parameters<StorageDrivers['validate']>) {
      validations++;
      super.validate(...args);
    }
  }

  const drivers = new Drivers();
  const store = new MemorySettings();
  const { logger, lines } = recordingLogger();
  const hooks = new HookBus({ logger, timeoutMs: 100 });

  for (const owner of ['original', 'other'])
    drivers.plugin(owner, 'storage', {
      label: owner,
      fields: [
        { key: 'token', label: 'Token', type: 'secret', required: true },
      ],
      connect: () => {
        throw new Error('Unexpected connection');
      },
    });
  const settings = new StorageSettings({
    settings: store,
    transactions: store,
    drivers,
    hooks,
    secrets: {
      seal: (value) => `sealed:${value}`,
      open: (value) => {
        opens++;

        return value.slice(7);
      },
    },
    test: async () => {},
  });
  const input = {
    driver: 'plugin:original:storage',
    s3: null,
    pluginSettings: { token: 'private' },
  };

  await settings.update(input);
  expect(validations).toBe(1);
  expect(opens).toBe(2);
  hooks
    .registrar('functions:site', { trusted: true })
    .filter('settings.beforeSave', (value) =>
      value.section === 'storage'
        ? {
            ...value,
            settings: { ...value.settings, driver: 'plugin:other:storage' },
          }
        : value,
    );
  validations = 0;
  opens = 0;
  await settings.update(input);
  expect(validations).toBe(2);
  expect(opens).toBe(3);
  expect(await settings.get()).toMatchObject({
    driver: 'plugin:original:storage',
  });
  expect(
    lines.some(
      (line) =>
        line.startsWith('warn ') && line.includes('settings.beforeSave'),
    ),
  ).toBe(true);
});

test('storage secrets stay sealed, preserve on omission, and never follow a changed endpoint', async () => {
  const values = new Map<string, unknown>();
  const store = {
    list: async (prefix: string) =>
      Object.fromEntries([...values].filter(([key]) => key.startsWith(prefix))),
    get: async (key: string) => values.get(key),
    set: async (key: string, value: unknown) => {
      values.set(key, value);
    },
    count: async () => 0,
  };
  let probeFails = false;
  const settings = new StorageSettings({
    settings: store,
    transactions: {
      run: async (key, task) => {
        await store.set(key, true);

        return task(store);
      },
    },
    secrets: {
      seal: (value) => `sealed:${value}`,
      open: (value) => value.slice(7),
    },
    test: async () => {
      if (probeFails) throw new Error('SECRET provider response');
    },
  });
  const s3 = {
    endpoint: 'https://storage.example.com',
    region: 'auto',
    bucket: 'media',
    accessKeyId: 'key',
    forcePathStyle: true,
    prefix: 'uploads/',
  };
  const saved = await settings.update({
    driver: 's3',
    s3: { ...s3, secretAccessKey: 'private-secret' },
  });

  expect(JSON.stringify(saved)).not.toContain('private-secret');
  expect(saved.s3?.secretAccessKeyConfigured).toBe(true);
  await settings.update({ driver: 's3', s3 });
  expect((await settings.configuration()).s3?.secretAccessKey).toBe(
    'private-secret',
  );
  await expect(
    settings.update({
      driver: 's3',
      s3: { ...s3, endpoint: 'https://other.example.com' },
    }),
  ).rejects.toThrow();
  expect(await settings.get()).toEqual(saved);
  probeFails = true;
  await expect(settings.update({ driver: 's3', s3 })).rejects.toMatchObject({
    code: 'invalid_input',
    message: Errors.MediaStorageProbeRejected,
  });
  expect(await settings.get()).toEqual(saved);
});
