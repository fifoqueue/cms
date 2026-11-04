import { expect, test } from 'bun:test';
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

test('media policies validate MIME, transform plans, metadata and bidirectional deletion', async () => {
  const repository = new MemoryMediaRepository();
  const storage = new MemoryMediaStorage();
  const hooks = new HookBus({
    timeoutMs: 50,
    logger: recordingLogger().logger,
  });
  const site = hooks.registrar('functions:site', { trusted: true });
  const qualities: (number | undefined)[] = [];
  const media = new MediaService({
    repository,
    storage,
    hooks,
    images: {
      ...fakeImages,
      resize: async (bytes, width, height, crop, quality) => {
        qualities.push(quality);

        return fakeImages.resize(bytes, width, height, crop, quality);
      },
    },
    ids: sequentialIds(),
    clock: fixedClock(),
    limiter: new MemoryRateLimitStore(),
    maxBytes: 1024,
    limits: async () => ({
      uploadsPerHour: 60,
      freeSpaceMb: 0,
      allowSvg: false,
    }),
  });
  const bytes = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10, 0, 0, 0, 13, 1, 2,
  ]);
  const actor = { id: 'a', role: 'author' };
  const narrow = site.filter('media.allowedTypes', () => []);

  await expect(media.upload(bytes, 'test.png', actor)).rejects.toThrow();
  narrow();
  const invalid = site.filter(
    'media.allowedTypes',
    () => ['application/x-unknown'] as never,
  );

  site.filter('media.imageSizes', (plan) => ({
    ...plan,
    quality: 55,
    sizes: [{ ...plan.sizes[0]!, width: 320 }],
  }));
  site.filter(
    'media.imageSizes',
    (plan) => ({
      ...plan,
      quality: 101,
      sizes: [{ name: 'unregistered', width: 9000 }],
    }),
    20,
  );
  site.filter('media.beforeInsert', (value) => ({
    ...value,
    filename: 'renamed.png',
    alt: 'alternative',
    caption: 'caption',
    title: 'title',
    description: 'description',
  }));
  site.filter(
    'media.beforeInsert',
    (value) => ({ ...value, filename: '../unsafe' }),
    20,
  );
  const uploaded = await media.upload(bytes, 'test.png', actor);

  invalid();
  expect(qualities).toEqual([55]);
  expect(uploaded.variants).toHaveLength(1);
  expect(uploaded.variants[0]?.width).toBe(320);
  expect(uploaded.filename).toBe('renamed.png');
  expect(uploaded.alt).toBe('alternative');
  expect(uploaded.caption).toBe('caption');
  expect(uploaded.title).toBe('title');
  expect(uploaded.description).toBe('description');
  const deny = site.filter('media.deleteAllowed', () => false);

  await expect(media.remove(uploaded.id, true, actor)).rejects.toThrow();
  expect(await repository.exists(uploaded.id)).toBe(true);
  repository.usages.set(uploaded.id, 1);
  let observed = '';

  site.filter(
    'media.deleteAllowed',
    (_allowed, context) => {
      observed = context.media.id;

      return true;
    },
    20,
  );
  await media.remove(uploaded.id, false, actor);
  expect(observed).toBe(uploaded.id);
  expect(await repository.exists(uploaded.id)).toBe(false);
  expect(storage.files.size).toBe(0);
  deny();
});
