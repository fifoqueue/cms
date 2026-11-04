import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { MediaService } from '#api/domain/media/media-service';
import { HookBus } from '#api/plugin-runtime/hook-bus';
import {
  fixedClock,
  recordingLogger,
  sequentialIds,
} from '#test/support/memory';
import {
  MemoryMediaRepository,
  MemoryMediaStorage,
  fakeImages,
} from '#test/support/memory-media';
import { MemoryRateLimitStore } from '#test/support/memory-security';

test('upload hooks borrow trusted bytes and isolate plugin mutations', async () => {
  const bytes = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 1, 2,
  ]);
  const expected = bytes.slice();
  const digest = createHash('sha256').update(bytes).digest('hex');
  const hooks = new HookBus({
    timeoutMs: 50,
    logger: recordingLogger().logger,
  });
  const observations: unknown[] = [];
  const plugin = hooks.registrar('plugin:bytes');
  plugin.filter('media.uploadAllowed', (value, context) => {
    observations.push(context.bytes === bytes);
    new Uint8Array(context.bytes.buffer).fill(0);
    return value;
  });
  plugin.filter('media.filename', (value, context) => {
    observations.push(Array.from(context.bytes));
    new Uint8Array(context.bytes.buffer).fill(0);
    return value;
  });
  const trusted = hooks.registrar('functions:site', { trusted: true });
  trusted.filter('media.uploadAllowed', (value, context) => {
    observations.push(
      context.bytes === bytes,
      context.originalName,
      context.mime,
      context.size,
    );
    return value;
  });
  trusted.filter('media.filename', (_value, context) => {
    observations.push(context.bytes === bytes);
    return `${createHash('sha256').update(context.bytes).digest('hex')}.png`;
  });
  trusted.filter('media.storageKey', (value, context) => ({
    ...value,
    basename: createHash('sha256').update(context.bytes).digest('hex'),
  }));
  const repository = new MemoryMediaRepository();
  const storage = new MemoryMediaStorage();
  const media = new MediaService({
    repository,
    storage,
    images: fakeImages,
    ids: sequentialIds(),
    clock: fixedClock(),
    hooks,
    limiter: new MemoryRateLimitStore(),
    maxBytes: 1024,
    limits: async () => ({
      uploadsPerHour: 60,
      freeSpaceMb: 256,
      allowSvg: false,
    }),
  });
  const uploaded = await media.upload(bytes, 'original.png', {
    id: 'a',
    role: 'author',
  });
  expect(uploaded.filename).toBe(`${digest}.png`);
  const record = await repository.get(uploaded.id);
  expect(record?.storageKey.endsWith(`/${digest}.png`)).toBe(true);
  expect(uploaded.url).toBe(`/media/${record!.storageKey}`);
  expect(storage.files.has(record!.storageKey)).toBe(true);
  expect(await media.file(record!.storageKey)).not.toBeNull();
  for (const variant of Object.values(record!.variants))
    expect(variant!.key).toContain(`/${digest}-`);
  expect(bytes).toEqual(expected);
  expect(observations).toEqual([
    false,
    true,
    'original.png',
    'image/png',
    expected.length,
    Array.from(expected),
    true,
  ]);
  const collision = await media.upload(bytes, 'original.png', {
    id: 'a',
    role: 'author',
  });
  expect(collision.url.endsWith(`/${digest}-1.png`)).toBe(true);
});
