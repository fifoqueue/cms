import { expect, test } from 'bun:test';
import { Elysia } from 'elysia';
import { MediaService } from '#api/domain/media/media-service';
import { SVG_MAX_BYTES } from '#api/domain/media/svg';
import { routes } from '#api/http/routes/api/v1/media/files/[...]';
import type { ApiApp } from '#api/http/services';
import { HookBus } from '#api/plugin-runtime/hook-bus';
import {
  fixedClock,
  recordingLogger,
  sequentialIds,
} from '#test/support/memory';
import {
  fakeImages,
  MemoryMediaRepository,
  MemoryMediaStorage,
} from '#test/support/memory-media';
import { MemoryRateLimitStore } from '#test/support/memory-security';

test('SVG originals are sanitized, bounded and served with sandboxed image headers', async () => {
  const storage = new MemoryMediaStorage();
  const media = new MediaService({
    repository: new MemoryMediaRepository(),
    storage,
    images: {
      ...fakeImages,
      dimensions: async () => {
        throw new Error('SVG must not reach the raster decoder');
      },
      resize: async () => {
        throw new Error('SVG must not be resized');
      },
    },
    ids: sequentialIds(),
    clock: fixedClock(),
    hooks: new HookBus({ timeoutMs: 50, logger: recordingLogger().logger }),
    limiter: new MemoryRateLimitStore(),
    limits: async () => ({
      allowSvg: true,
      uploadsPerHour: 60,
      freeSpaceMb: 0,
    }),
    maxBytes: SVG_MAX_BYTES * 2,
  });
  const actor = { id: 'author', role: 'author' };
  const encode = (value: string) => new TextEncoder().encode(value);
  await expect(
    media.upload(
      encode(`<svg>${' '.repeat(SVG_MAX_BYTES)}</svg>`),
      'big.svg',
      actor,
    ),
  ).rejects.toMatchObject({ code: 'invalid_input' });
  await expect(
    media.upload(encode('<svg/>'), 'safe.svg', {
      id: 'c',
      role: 'contributor',
    }),
  ).rejects.toMatchObject({ code: 'forbidden' });
  const result = await media.upload(
    encode(
      '<svg viewBox="0 0 20 10"><path style="fill:url(https://evil.test)"/></svg>',
    ),
    'fake.jpg',
    actor,
  );
  expect(result.variants).toEqual([]);
  expect(storage.files.size).toBe(1);
  const key = result.url.slice('/media/'.length);
  const app = routes(
    new Elysia({ prefix: '/files/*' }).decorate(
      'media',
      media,
    ) as unknown as ApiApp,
  );
  for (const range of [undefined, 'bytes=0-15']) {
    const response = await app.handle(
      new Request(`http://localhost/files/${key}`, {
        headers: range ? { range } : {},
      }),
    );
    expect(response.status).toBe(range ? 206 : 200);
    expect(response.headers.get('content-type')).toBe('image/svg+xml');
    expect(response.headers.get('content-disposition')).toBe(
      'attachment; filename="image.svg"',
    );
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('content-security-policy')).toBe(
      "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox",
    );
    const body = await response.text();
    expect(body).not.toContain('evil.test');
    if (!range) {
      expect(body).toContain('style=""');
      expect([...encode(body)]).toEqual([...storage.files.get(key)!]);
      expect(result.size).toBe(encode(body).length);
    }
  }
});
