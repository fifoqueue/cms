import { expect, test } from 'bun:test';
import { HookBus } from '#api/plugin-runtime/hook-bus';
import { MediaService } from '#api/domain/media/media-service';
import { projectMedia, toPublicImage } from '#api/domain/media/media-mapper';
import { projectMediaUrl } from '#api/domain/media/media-url';
import { ResponsiveImages } from '#api/domain/content/responsive-images';
import {
  MemoryMediaRepository,
  MemoryMediaStorage,
  fakeImages,
} from '#test/support/memory-media';
import {
  fixedClock,
  recordingLogger,
  sequentialIds,
} from '#test/support/memory';
import { MemoryRateLimitStore } from '#test/support/memory-security';

const setup = () => {
  const hooks = new HookBus({
    timeoutMs: 50,
    logger: recordingLogger().logger,
  });
  const repository = new MemoryMediaRepository();
  const storage = new MemoryMediaStorage();
  const media = new MediaService({
    repository,
    storage,
    hooks,
    images: fakeImages,
    ids: sequentialIds(),
    clock: fixedClock(),
    limiter: new MemoryRateLimitStore(),
    maxBytes: 1024,
    limits: async () => ({
      uploadsPerHour: 60,
      freeSpaceMb: 0,
      allowSvg: false,
    }),
    selectStorage: async () => ({
      driver: 'plugin:test:storage',
      storage,
      url: (key) => `/media/${key}`,
    }),
  });

  return { hooks, repository, storage, media };
};
const bytes = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10, 0, 0, 0, 13, 1, 2,
]);
const actor = { id: 'a', role: 'author' };

test('public image metadata follows library edits without exposing uploader or usage data', async () => {
  const { media, repository } = setup();
  const uploaded = await media.upload(bytes, 'public.png', actor);
  const row = (await repository.get(uploaded.id))!;
  const url = `/media/${row.storageKey}`;

  await media.update(uploaded.id, { alt: 'Current library text' }, actor);
  const result = await media.publicImages({
    urls: [url, 'https://unknown.test/not-fetched.png'],
  });

  expect(Object.keys(result)).toEqual([url]);
  expect(result[url]).toMatchObject({
    width: 2000,
    height: 1000,
    alt: 'Current library text',
  });
  expect(Object.keys(result[url]!).sort()).toEqual([
    'alt',
    'height',
    'sizes',
    'url',
    'width',
  ]);
  await media.update(uploaded.id, { alt: 'Edited later' }, actor);
  expect((await media.publicImages({ urls: [url] }))[url]!.alt).toBe(
    'Edited later',
  );
});

test('invalid storage keys fall back, and plugin storage receives the accepted key', async () => {
  const { hooks, repository, storage, media } = setup();
  const site = hooks.registrar('functions:site', { trusted: true });

  for (const key of [
    '../bad.png',
    '/bad.png',
    'a\\bad.png',
    'bad\u0000.png',
    `${'a'.repeat(256)}.png`,
    'bad.exe',
  ]) {
    const release = site.filter('media.storageKey', (value) => {
      value.key = key;

      return value;
    });
    const uploaded = await media.upload(bytes, 'test.png', actor);
    const row = (await repository.get(uploaded.id))!;

    expect(row.storageKey.endsWith(`/${uploaded.id}.png`)).toBe(true);
    release();
  }

  site.filter('media.storageKey', (value) => ({
    ...value,
    basename: 'chosen',
  }));
  const uploaded = await media.upload(bytes, 'test.png', actor);
  const row = (await repository.get(uploaded.id))!;

  expect(row.storageDriver).toBe('plugin:test:storage');
  expect(row.storageKey.endsWith('/chosen.png')).toBe(true);
  expect(storage.files.has(row.storageKey)).toBe(true);
});

test('shared URL projection rewrites admin, public and responsive images safely', async () => {
  const { hooks, repository, media } = setup();
  const site = hooks.registrar('functions:site', { trusted: true });
  const seen: string[] = [];

  site.filter('media.url', (value) => {
    seen.push(value.driver);

    return { ...value, url: `https://cdn.example/${value.key}` };
  });
  const uploaded = await media.upload(bytes, 'test.png', actor);
  const row = (await repository.get(uploaded.id))!;

  expect(uploaded.url).toBe(`https://cdn.example/${row.storageKey}`);
  expect((await media.get(uploaded.id, actor)).url).toBe(uploaded.url);
  const image = toPublicImage(await projectMedia(row, hooks));

  image.alt = 'Library "caption"';

  expect(image.url).toBe(uploaded.url);
  expect(
    image.sizes.every((size) => size.url.startsWith('https://cdn.example/')),
  ).toBe(true);
  const html = await new ResponsiveImages(
    async () => new Map([[row.id, image]]),
  ).expand(
    `<img data-media-id="${row.id}" src="/old.png" alt="" width="80" loading="lazy">`,
  );

  expect(html).toContain(`src="${image.url}"`);
  expect(html).toContain('alt="Library &quot;caption&quot;"');
  expect(html).toContain('width="80"');
  expect(html).toContain(`height="${image.height}"`);
  expect(html).toContain('srcset="https://cdn.example/');
  expect(seen.every((driver) => driver === 'plugin:test:storage')).toBe(true);
  const initial = {
    url: '/media/core.png',
    key: 'core.png',
    variant: null,
    driver: 'local',
  };

  for (const url of [
    'javascript:alert(1)',
    '//evil.example/a',
    '/\\evil.example/a',
    'https://evil.example/\n',
  ]) {
    const bus = new HookBus({
      timeoutMs: 50,
      logger: recordingLogger().logger,
    });

    bus
      .registrar('functions:site', { trusted: true })
      .filter('media.url', (value) => {
        value.url = url;

        return value;
      });
    expect(await projectMediaUrl({ ...initial }, bus)).toBe(initial.url);
  }

  const empty = new HookBus({
    timeoutMs: 50,
    logger: recordingLogger().logger,
  });

  expect(projectMediaUrl(initial, empty)).toBe(initial.url);
  const deletionUrls: string[] = [];

  site.filter('media.deleteAllowed', (allowed, { media: item }) => {
    deletionUrls.push(item.url);

    return allowed;
  });
  site.on('media.deleted', (item) => {
    deletionUrls.push(item.url);
  });
  await media.remove(uploaded.id, true, actor);
  expect(deletionUrls).toEqual([uploaded.url, uploaded.url]);
});
