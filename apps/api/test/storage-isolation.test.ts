import { expect, test } from 'bun:test';
import { StorageDrivers } from '#api/domain/media/storage-drivers';
import { Errors } from '#api/shared/errors';
import type { MediaStorage } from '#api/domain/media/ports';

test('connect, commit, read, remove and streaming failures are bounded and sanitized', async () => {
  const details: unknown[] = [];
  const drivers = new StorageDrivers(
    {
      warn: (_message, ...errors) => {
        details.push(...errors);
      },
    },
    10,
  );
  const secret = 'private-plugin-credential';
  const base = (): MediaStorage => ({
    commit: async () => 'stored',
    read: async () => null,
    remove: async () => undefined,
  });
  const noResult = () => new Promise<never>(() => undefined);
  for (const operation of ['commit', 'read', 'remove'] as const) {
    const failure = base();
    failure[operation] = noResult;
    const release = drivers.plugin('faulty', operation, {
      label: 'Faulty',
      fields: [],
      connect: () => failure,
    });
    const storage = drivers.get(`plugin:faulty:${operation}`)!;
    const task =
      operation === 'commit'
        ? storage.commit([], 0)
        : operation === 'read'
          ? storage.read('key')
          : storage.remove(['key']);
    await expect(task).rejects.toThrow(Errors.MediaStorageOperation);
    release();
  }
  drivers.plugin('faulty', 'connect', {
    label: 'Faulty',
    fields: [],
    connect: () => {
      throw new Error(secret);
    },
  });
  await expect(
    drivers.get('plugin:faulty:connect')!.read('key'),
  ).rejects.toThrow(Errors.MediaStorageOperation);
  drivers.plugin('faulty', 'stream', {
    label: 'Faulty',
    fields: [],
    connect: () => ({
      ...base(),
      read: async () => ({
        size: 1,
        start: 0,
        end: 0,
        body: new ReadableStream<Uint8Array>({
          pull: noResult,
          cancel: () => {
            throw new Error(secret);
          },
        }),
      }),
    }),
  });
  const file = await drivers.get('plugin:faulty:stream')!.read('key');
  await expect(new Response(file!.body).arrayBuffer()).rejects.toThrow(
    Errors.MediaStorageOperation,
  );
  expect(
    details.some((error) => error instanceof Error && error.message === secret),
  ).toBe(true);
  expect(drivers.get('local')).toBeNull();
});
