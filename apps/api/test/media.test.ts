import { describe, expect, test } from 'bun:test';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FsMediaStorage } from '#api/infra/fs-media-storage';
import { HookBus } from '#api/plugin-runtime/hook-bus';
import { MediaService } from '#api/domain/media/media-service';
import { ImageSizes } from '#api/domain/media/image-sizes';
import { MediaProcessors } from '#api/domain/media/media-processors';
import type { DomainError } from '#api/shared/errors';
import { Errors } from '#api/shared/errors';
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

test('filesystem uploads release the space lock after each successful commit', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cms-media-test-'));
  try {
    const storage = new FsMediaStorage(root);
    for (const key of ['first.png', 'second.png']) {
      expect(await storage.commit([{ key, bytes: PNG }], 0)).toBe('stored');
      expect(await readdir(root)).not.toContain('.space-lock');
      const file = await storage.read(key);
      expect(
        new Uint8Array(await new Response(file!.body).arrayBuffer()),
      ).toEqual(PNG);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

const setup = (allowSvg = false) => {
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
  });
  return { media, repository, storage, hooks, sizes, processors };
};

const author = { id: 'a', role: 'author' };
const other = { id: 'b', role: 'author' };
const editor = { id: 'e', role: 'editor' };

describe('media library', () => {
  test('oversized processor results fall back and bounded sizes fit the TEXT column', async () => {
    const { media, repository, processors, sizes } = setup();
    processors.register({ process: () => new Uint8Array(2048) });
    sizes.register({ name: 'oversize', width: 3000, height: 2000 });
    for (let i = 0; i < 100; i++)
      sizes.register({
        name: `size-${i}-${'x'.repeat(50)}`,
        width: 100,
        height: 100,
      });
    const uploaded = await media.upload(PNG, 'safe.png', author);
    expect(uploaded.size).toBe(PNG.length + 1);
    expect(uploaded.variants.length).toBeLessThanOrEqual(32);
    expect(uploaded.variants.some(({ name }) => name === 'oversize')).toBe(
      false,
    );
    expect(
      new TextEncoder().encode(
        JSON.stringify(repository.rows.get(uploaded.id)!.variants),
      ).length,
    ).toBeLessThan(65535);
  });
  test('custom derivatives generate on upload and demand, stop after removal, and keep stored files', async () => {
    const { media, sizes, storage } = setup();
    const remove = sizes.register({ name: 'card-wide', width: 600 });
    const first = await media.upload(PNG, 'first.png', author);
    expect(first.variants.some((variant) => variant.name === 'card-wide')).toBe(
      true,
    );
    expect(await media.derivative(first.id, 'card-wide', author)).toMatchObject(
      { width: 600 },
    );
    const keys = [...storage.files.keys()];
    remove();
    expect(await codeOf(media.derivative(first.id, 'card-wide', author))).toBe(
      'not_found',
    );
    const second = await media.upload(PNG, 'second.png', author);
    expect(
      second.variants.some((variant) => variant.name === 'card-wide'),
    ).toBe(false);
    for (const key of keys) expect(storage.files.has(key)).toBe(true);
  });
  test('metadata and filename filters validate output and emit committed metadata', async () => {
    const { media, hooks } = setup();
    const plugin = hooks.registrar('metadata');
    const events: unknown[] = [];
    plugin.on('media.updated', (value) => {
      events.push(value);
    });
    plugin.filter('media.filename', () => 'renamed.png');
    plugin.filter('media.filename', () => '../unsafe.png', 20);
    plugin.filter('media.beforeSave', (value) => ({
      ...value,
      alt: '  filtered  ',
    }));
    plugin.filter('media.beforeSave', () => ({ alt: 'x'.repeat(501) }), 20);
    const upload = await media.upload(PNG, 'original.png', author);
    expect(upload.filename).toBe('renamed.png');
    const updated = await media.update(upload.id, { alt: 'original' }, author);
    expect(updated.alt).toBe('filtered');
    expect(events).toEqual([updated]);
  });
  test('upload refusal cannot be reversed and writes no files', async () => {
    const { media, hooks, storage } = setup();
    const plugin = hooks.registrar('admission');
    plugin.filter('media.uploadAllowed', (value) => {
      expect(value).toEqual({
        allowed: true,
        filename: 'cat.png',
        mime: 'image/png',
        size: PNG.length,
      });
      return { ...value, allowed: false };
    });
    plugin.filter(
      'media.uploadAllowed',
      (value) => ({ ...value, allowed: true }),
      20,
    );
    expect(await codeOf(media.upload(PNG, 'cat.png', author))).toBe(
      'forbidden',
    );
    expect(storage.files.size).toBe(0);
    await expect(media.upload(PNG, 'cat.png', author)).rejects.toMatchObject({
      message: Errors.MediaUploadRefused,
    });
  });
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
  test('SVG policy, content sniffing and sanitized original-only storage', async () => {
    const bytes = new TextEncoder().encode(
      '<svg viewBox="0 0 640 480"><path style="fill:url(https://evil.test/x)" d="M0 0"/></svg>',
    );
    expect(
      await codeOf(setup().media.upload(bytes, 'diagram.svg', author)),
    ).toBe('invalid_input');
    const { media, storage } = setup(true);
    const result = await media.upload(bytes, 'spoof.png', author);
    expect(result).toMatchObject({
      mime: 'image/svg+xml',
      kind: 'image',
      width: 640,
      height: 480,
      variants: [],
    });
    expect(storage.files.size).toBe(1);
    expect(
      new TextDecoder().decode([...storage.files.values()][0]),
    ).not.toContain('evil.test');
    expect(
      await codeOf(
        media.upload(
          new TextEncoder().encode('<html>bad</html>'),
          'spoof.svg',
          author,
        ),
      ),
    ).toBe('invalid_input');
  });
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
    low.storage.freeBytes = 256 * 1024 * 1024 + 17;
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

  test('the library filters by month and attachment and lists where a file is used', async () => {
    const { media, repository } = setup();
    const first = await media.upload(PNG, 'a.png', author);
    const second = await media.upload(PNG, 'b.png', author);
    repository.usages.set(first.id, 1);
    repository.entries.set(first.id, [
      { id: 'c1', title: 'Post', type: 'post' },
    ]);
    const month = first.createdAt.slice(0, 7);

    const unattached = await media.list({ unattached: 'true' }, author);
    expect(unattached.items.map(({ id }) => id)).toEqual([second.id]);
    expect((await media.list({ month }, author)).total).toBe(2);
    expect((await media.list({ month: '1999-01' }, author)).total).toBe(0);
    expect(await media.context(first.id, author)).toEqual({
      newerId: second.id,
      olderId: null,
      usedIn: [{ id: 'c1', title: 'Post', type: 'post' }],
    });
    // An account that may upload files but not list content sees published entries only.
    repository.entries.set(first.id, [
      { id: 'c1', title: 'Post', type: 'post', published: true },
      { id: 'c2', title: 'PRIVATE PLAN', type: 'post' },
    ]);
    const uploader = {
      id: 'u',
      role: 'uploader',
      capabilities: ['media.upload' as const],
    };
    expect((await media.context(first.id, uploader)).usedIn).toEqual([
      { id: 'c1', title: 'Post', type: 'post' },
    ]);
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
