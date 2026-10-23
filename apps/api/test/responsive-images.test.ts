import { expect, test } from 'bun:test';
import { ResponsiveImages } from '#api/domain/content/responsive-images';

test('body images get library sizes, dimensions and lazy loading after the first', async () => {
  const images = new ResponsiveImages(
    async (ids) =>
      new Map(
        ids
          .filter((id) => id === 'm1')
          .map((id) => [
            id,
            {
              url: '/media/a.png',
              alt: '',
              width: 1600,
              height: 900,
              sizes: [
                { url: '/media/a-300.webp', width: 300 },
                { url: '/media/a.png', width: 1600 },
              ],
            },
          ]),
      ),
  );
  const html = await images.expand(
    '<img src="/media/a.png" alt="A" data-media-id="m1"/><p>x</p><img src="https://cdn.test/b.png" alt="" data-media-id="gone"/>',
  );
  expect(html).toBe(
    '<img src="/media/a.png" alt="A" data-media-id="m1" srcset="/media/a-300.webp 300w, /media/a.png 1600w" sizes="(max-width: 48rem) 100vw, 48rem" width="1600" height="900" decoding="async"><p>x</p>' +
      '<img src="https://cdn.test/b.png" alt="" data-media-id="gone" loading="lazy" decoding="async">',
  );
});
