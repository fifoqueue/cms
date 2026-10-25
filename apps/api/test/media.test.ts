import { describe, expect, test } from 'bun:test';
import { HookBus } from '#api/plugin-runtime/hook-bus';
import { MediaService } from '#api/domain/media/media-service';
import type { MediaServiceDeps } from '#api/domain/media/media-service';
import { ImageSizes } from '#api/domain/media/image-sizes';
import { MediaProcessors } from '#api/domain/media/media-processors';
import type { DomainError } from '#api/shared/errors';
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

const codeOf = async (promise: Promise<unknown>) =>
  promise.then(
    () => 'ok',
    (error: DomainError) => error.code,
  );

const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 1, 2,
]);

const setup = (allowSvg = false, overrides: Partial<MediaServiceDeps> = {}) => {
  const repository = new MemoryMediaRepository();
  const storage = new MemoryMediaStorage();
  const sizes = new ImageSizes();
  const processors = new MediaProcessors();
  processors.registerCore({
    process: ({ bytes, mime }) => fakeImages.clean(bytes, mime),
  });
  const hooks = new HookBus({
    timeoutMs: 50,
    logger: recordingLogger().logger,
  });
  const media = new MediaService({
    processors,
    sizes,
    repository,
    storage,
    images: fakeImages,
    ids: sequentialIds(),
    clock: fixedClock(),
    hooks,
    limiter: new MemoryRateLimitStore(),
    limits: async () => ({ uploadsPerHour: 60, freeSpaceMb: 256, allowSvg }),
    maxBytes: 1024,
    ...overrides,
  });
  return { media, repository, storage, hooks, sizes, processors };
};

const author = { id: 'a', role: 'author' };
const other = { id: 'b', role: 'author' };
const editor = { id: 'e', role: 'editor' };

describe('media library', () => {
  test('UTF BOM uploads cannot bypass SVG policy as MPEG, and valid audio still uploads', async () => {
    const { media, storage } = setup();
    for (const bom of [
      [255, 254],
      [254, 255],
      [255, 254, 0, 0],
      [0, 0, 254, 255],
    ]) {
      const xml = '<svg><script>alert(1)</script></svg>';
      const bytes = new Uint8Array([
        ...bom,
        ...[...xml].flatMap((char) => [char.charCodeAt(0), 0]),
      ]);
      expect(await codeOf(media.upload(bytes, 'fake.mp3', author))).toBe(
        'invalid_input',
      );
    }
    for (const header of [
      [255, 235, 144, 0],
      [255, 249, 144, 0],
      [255, 251, 240, 0],
      [255, 251, 156, 0],
    ]) {
      expect(
        await codeOf(
          media.upload(
            new Uint8Array([...header, ...Array(12).fill(0)]),
            'bad.mp3',
            author,
          ),
        ),
      ).toBe('invalid_input');
    }
    expect(storage.files.size).toBe(0);
    for (const header of [
      [255, 251, 144, 0],
      [73, 68, 51, 4],
    ]) {
      expect(
        (
          await media.upload(
            new Uint8Array([...header, ...Array(12).fill(0)]),
            'audio.mp3',
            author,
          )
        ).mime,
      ).toBe('audio/mpeg');
    }
  });

  test('uploads are typed by their bytes, cleaned and resized', async () => {
    const { media, storage } = setup();

    const html = new TextEncoder().encode('<html><script>x</script></html>');
    expect(await codeOf(media.upload(html, 'cat.jpg', author))).toBe(
      'invalid_input',
    );
    expect(
      await codeOf(media.upload(new Uint8Array(2048), 'big.png', author)),
    ).toBe('invalid_input');
    expect(
      await codeOf(
        media.upload(PNG, 'x.png', { id: 'c', role: 'contributor' }),
      ),
    ).toBe('forbidden');

    const image = await media.upload(PNG, '../../secret/Cat.PNG', author);
    expect(image).toMatchObject({
      mime: 'image/png',
      filename: 'Cat.PNG',
      width: 2000,
    });
    expect(image.url).toMatch(/^\/media\/2026\/01\/[0-9a-f-]{36}\.png$/);
    expect(image.variants.map((variant) => variant.name)).toEqual([
      'thumbnail',
      'medium',
      'large',
    ]);
    // The stored original is the re-encoded one, not the upload as sent.
    const key = image.url.slice('/media/'.length);
    expect(storage.files.get(key)?.at(-1)).toBe(0);
    expect(await media.file('../config.json')).toBeNull();
  });

  test('only the uploader or managers change a file, and used files need force', async () => {
    const { media, repository, storage } = setup();
    const image = await media.upload(PNG, 'cat.png', author);

    expect(await codeOf(media.update(image.id, { alt: 'x' }, other))).toBe(
      'forbidden',
    );
    expect(await codeOf(media.update(image.id, { alt: 'A cat' }, editor))).toBe(
      'ok',
    );
    // An alt-only change (the media picker) keeps a caption written elsewhere.
    await media.update(image.id, { caption: 'Newer caption' }, author);
    expect(
      await media.update(image.id, { alt: 'From the picker' }, author),
    ).toMatchObject({ alt: 'From the picker', caption: 'Newer caption' });

    repository.usages.set(image.id, 2);
    expect(await codeOf(media.remove(image.id, false, author))).toBe(
      'conflict',
    );
    await media.remove(image.id, true, author);
    expect(storage.files.size).toBe(0);
    const key = image.url.slice('/media/'.length);
    storage.files.set(key, PNG);
    expect(await media.file(key)).toBeNull();
  });
});
