import { expect, test } from 'bun:test';
import { default as sharp } from 'sharp';
import { Elysia } from 'elysia';
import { sharpImages } from '#api/infra/sharp-images';
import { MediaService } from '#api/domain/media/media-service';
import { ImageSizes } from '#api/domain/media/image-sizes';
import { routes } from '#api/http/routes/api/v1/admin/media/[id]/derivative';
import { toErrorResponse } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';
import { HookBus } from '#api/plugin-runtime/hook-bus';
import {
  fixedClock,
  sequentialIds,
  recordingLogger,
} from '#test/support/memory';
import {
  MemoryMediaRepository,
  MemoryMediaStorage,
  fakeImages,
} from '#test/support/memory-media';
import { MemoryRateLimitStore } from '#test/support/memory-security';

test('real Sharp crops to a declared box while non-crop preserves aspect ratio', async () => {
  const source = await sharp({
    create: { width: 240, height: 120, channels: 3, background: '#e22' },
  })
    .png()
    .toBuffer();
  const crop = await sharpImages.resize(source, 60, 60, true);
  const fit = await sharpImages.resize(source, 60, 60, false);
  expect(await sharp(crop.bytes).metadata()).toMatchObject({
    format: 'webp',
    width: 60,
    height: 60,
  });
  expect(await sharp(fit.bytes).metadata()).toMatchObject({
    format: 'webp',
    width: 60,
    height: 30,
  });
});

test('derivative HTTP route authorizes, validates registry/type, and caps concurrent work', async () => {
  const actor = { id: 'author', role: 'author' };
  const logger = recordingLogger().logger;
  const sizes = new ImageSizes();
  sizes.register({ name: 'square', width: 100, height: 100, crop: true });
  let blocked = false;
  let starts = 0;
  const releases: (() => void)[] = [];
  const media = new MediaService({
    sizes,
    repository: new MemoryMediaRepository(),
    storage: new MemoryMediaStorage(),
    images: {
      ...fakeImages,
      resize: async (...args) => {
        if (blocked) {
          starts += 1;
          await new Promise<void>((resolve) => releases.push(resolve));
        }
        return fakeImages.resize(...args);
      },
    },
    ids: sequentialIds(),
    clock: fixedClock(),
    hooks: new HookBus({ timeoutMs: 50, logger }),
    limiter: new MemoryRateLimitStore(),
    maxBytes: 1024,
    limits: async () => ({
      allowSvg: false,
      uploadsPerHour: 60,
      freeSpaceMb: 0,
    }),
  });
  const image = await media.upload(
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13]),
    'image.png',
    actor,
  );
  const pdf = await media.upload(
    new TextEncoder().encode('%PDF-1.4\n%%EOF\n'),
    'doc.pdf',
    actor,
  );
  const app = routes(
    new Elysia({ prefix: '/api/v1/admin/media/:id/derivative' })
      .onError(({ error }) => toErrorResponse(error, logger))
      .decorate('media', media)
      .decorate('auth', {
        authenticate: async (token: string) =>
          token === 'author'
            ? actor
            : token === 'reader'
              ? { id: 'reader', role: 'subscriber' }
              : null,
      }) as unknown as ApiApp,
  );
  const request = (id = image.id, name = 'square', token = 'author') =>
    app.handle(
      new Request(
        `http://localhost/api/v1/admin/media/${id}/derivative?name=${encodeURIComponent(name)}`,
        {
          method: 'POST',
          headers: token ? { authorization: `Bearer ${token}` } : {},
        },
      ),
    );
  expect((await request(image.id, 'square', '')).status).toBe(401);
  expect((await request(image.id, 'square', 'reader')).status).toBe(403);
  expect((await request(image.id, '../unknown')).status).toBe(404);
  expect((await request(pdf.id)).status).toBe(400);
  const success = await request();
  expect(success.status).toBe(200);
  expect(success.headers.get('content-type')).toBe('image/webp');
  expect(success.headers.get('cache-control')).toBe('private, no-store');
  blocked = true;
  const pending = [request(), request()];
  for (let i = 0; starts < 2 && i < 100; i++)
    await new Promise((resolve) => setTimeout(resolve, 1));
  expect(starts).toBe(2);
  expect((await request()).status).toBe(429);
  blocked = false;
  releases.forEach((release) => release());
  expect(
    (await Promise.all(pending)).map((response) => response.status),
  ).toEqual([200, 200]);
  expect((await request()).status).toBe(200);
});
