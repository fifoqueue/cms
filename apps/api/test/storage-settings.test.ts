import { expect, test } from 'bun:test';
import { StorageSettings } from '#api/domain/media/storage-settings';
import { Errors } from '@cms/sdk/errors';

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
