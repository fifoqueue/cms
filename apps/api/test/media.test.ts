import { describe, expect, test } from 'bun:test';
import { HookBus } from '#api/plugin-runtime/hook-bus';
import { MediaService } from '#api/domain/media/media-service';
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

const setup = () => {
  const repository = new MemoryMediaRepository();
  const storage = new MemoryMediaStorage();
  const media = new MediaService({
    repository,
    storage,
    images: fakeImages,
    ids: sequentialIds(),
    clock: fixedClock(),
    hooks: new HookBus({ timeoutMs: 50, logger: recordingLogger().logger }),
    limiter: new MemoryRateLimitStore(),
    maxBytes: 1024,
  });
  return { media, repository, storage };
};

const author = { id: 'a', role: 'author' };
const other = { id: 'b', role: 'author' };
const editor = { id: 'e', role: 'editor' };

describe('media library', () => {
  test('image edits require ownership and valid bounds while preserving the original', async () => {
    const { media, repository, storage } = setup();
    const uploaded = await media.upload(PNG, 'cat.png', author);
    const original = await media.update(
      uploaded.id,
      { alt: 'A cat', caption: 'Original caption' },
      author,
    );
    const originalFiles = new Map(
      [...storage.files].map(([key, bytes]) => [key, bytes.slice()]),
    );

    expect(await codeOf(media.edit(original.id, { rotate: 90 }, other))).toBe(
      'forbidden',
    );
    expect(
      await codeOf(
        media.edit(
          original.id,
          {
            crop: { left: 1999, top: 0, width: 2, height: 1 },
          },
          author,
        ),
      ),
    ).toBe('invalid_input');
    expect(repository.rows.size).toBe(1);
    expect(storage.files).toEqual(originalFiles);

    const copy = await media.edit(
      original.id,
      {
        crop: { left: 0, top: 0, width: 100, height: 100 },
        rotate: 90,
        flip: true,
      },
      author,
    );
    expect(copy.id).not.toBe(original.id);
    expect(copy.url).not.toBe(original.url);
    expect(copy).toMatchObject({ alt: 'A cat', caption: 'Original caption' });
    expect(await media.get(original.id, author)).toEqual(original);
    expect(repository.rows.size).toBe(2);
    for (const [key, bytes] of originalFiles)
      expect(storage.files.get(key)).toEqual(bytes);
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

  test('uploads stop before exhausting storage or one user floods the site', async () => {
    const low = setup();
    low.storage.freeBytes = 0;
    expect(await codeOf(low.media.upload(PNG, 'cat.png', author))).toBe(
      'conflict',
    );
    expect(low.storage.files.size).toBe(0);

    const flood = setup();
    for (let index = 0; index < 60; index += 1)
      await flood.media.upload(PNG, `${index}.png`, author);
    expect(await codeOf(flood.media.upload(PNG, 'last.png', author))).toBe(
      'rate_limited',
    );
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
