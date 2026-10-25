import { expect, test } from 'bun:test';
import { wxrImportOptionsSchema } from '@cms/sdk';
import { importMedia, rewriteMedia } from '#api/domain/tools/import-media';
import type { ImportMediaDeps } from '#api/domain/tools/import-media';
import type { WxrItem } from '#api/domain/tools/wxr';
import type { AdminMedia, ContentDocument } from '@cms/sdk';

test('downloads are bounded, metadata is retained and repeated URLs reuse uploads', async () => {
  const settings = new Map<string, unknown>();
  let uploads = 0;
  let fetches = 0;
  const record = {
    id: 'local',
    url: '/media/local.png',
    variants: [],
  } as unknown as AdminMedia;
  const item = {
    attachmentUrl: 'https://old.test/file.png',
    title: 'Title',
    excerpt: 'Caption',
    html: 'Description',
    meta: { _wp_attachment_image_alt: 'Alt' },
  } as unknown as WxrItem;
  const deps: ImportMediaDeps = {
    settings: {
      get: async (key) => settings.get(key),
      set: async (key, value) => {
        settings.set(key, value);
      },
      list: async () => ({}),
    },
    fetch: async (_url, init) => {
      fetches++;
      expect(init?.signal).toBeDefined();
      return new Response(new Uint8Array([1, 2, 3]));
    },
    media: {
      maxBytes: 3,
      get: async () => record,
      upload: async (bytes, _filename, _actor, options) => {
        uploads++;
        expect(bytes.length).toBe(3);
        // Imports bypass only the hourly upload limit.
        expect(options).toEqual({ rateLimit: false });
        return record;
      },
      update: async (_id, metadata) => {
        expect(metadata).toEqual({
          title: 'Title',
          caption: 'Caption',
          description: 'Description',
          alt: 'Alt',
        });
        return record;
      },
    },
  };
  const actor = { id: 'admin', role: 'administrator' };
  await importMedia(item, actor, deps);
  await importMedia(item, actor, deps);
  await importMedia(
    { ...item, attachmentUrl: 'https://old.test/%66ile-scaled.png?ver=1' },
    actor,
    deps,
  );
  expect(uploads).toBe(1);
  expect(fetches).toBe(1);
  settings.clear();
  deps.fetch = async () => new Response(new Uint8Array([1, 2, 3, 4]));
  await expect(importMedia(item, actor, deps)).rejects.toThrow();
  expect(uploads).toBe(1);

  // Re-importing a file larger than one batch must advance past cached URLs.
  deps.fetch = async () => {
    fetches++;
    return new Response(new Uint8Array([1, 2, 3]));
  };
  const entries = Array.from({ length: 101 }, (_, index) => ({
    ...item,
    attachmentUrl: `https://old.test/${index}.png`,
  }));
  const first = { remaining: 100 };
  for (const entry of entries.slice(0, 100))
    await importMedia(entry, actor, deps, first);
  await expect(importMedia(entries[100]!, actor, deps, first)).rejects.toThrow(
    'Download limit reached. Re-import to download the remaining files into the media library; entries already imported are not updated.',
  );
  expect(uploads).toBe(101);
  expect(fetches).toBe(101);
  const resumed = { remaining: 100 };
  for (const entry of entries) await importMedia(entry, actor, deps, resumed);
  expect(uploads).toBe(102);
  expect(fetches).toBe(102);
  expect(resumed.remaining).toBe(99);
  // An upstream failure consumes an attempt too, preventing unbounded retries.
  deps.fetch = async () => {
    throw new Error('unreachable');
  };
  const failed = { remaining: 1 };
  await expect(
    importMedia(
      { ...item, attachmentUrl: 'https://old.test/fail.png' },
      actor,
      deps,
      failed,
    ),
  ).rejects.toThrow('unreachable');
  expect(failed.remaining).toBe(0);
});

test('download option defaults off and distinguishes false query strings', () => {
  expect(wxrImportOptionsSchema.parse({}).downloadAttachments).toBe(false);
  expect(
    wxrImportOptionsSchema.parse({ downloadAttachments: 'false' })
      .downloadAttachments,
  ).toBe(false);
  expect(
    wxrImportOptionsSchema.parse({ downloadAttachments: 'true' })
      .downloadAttachments,
  ).toBe(true);
});

test('attachment originals, resized images and linked files become library references', () => {
  const media = {
    id: 'new-id',
    url: '/media/original.png',
    variants: [
      { name: 'medium', width: 768, height: 300, url: '/media/medium.webp' },
    ],
  } as AdminMedia;
  const document = {
    type: 'doc',
    content: [
      { type: 'image', attrs: { src: 'https://old.test/file-768x300.png' } },
      { type: 'image', attrs: { src: 'https://old.test/file-999x400.png' } },
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'file',
            marks: [
              { type: 'link', attrs: { href: 'https://old.test/file.png' } },
            ],
          },
        ],
      },
    ],
  } as ContentDocument;
  rewriteMedia(document, new Map([['https://old.test/file.png', media]]));
  expect(document.content?.[0]?.attrs).toMatchObject({
    src: '/media/medium.webp',
    mediaId: 'new-id',
  });
  expect(document.content?.[1]?.attrs).toMatchObject({
    src: '/media/original.png',
    mediaId: 'new-id',
  });
  expect(JSON.stringify(document)).not.toContain('https://old.test');
});

test('source aliases preserve semantic queries and only strip terminal size suffixes', () => {
  const media = {
    id: 'local',
    url: '/media/local.png',
    variants: [
      { name: 'size', width: 1024, height: 380, url: '/media/size.webp' },
    ],
  } as AdminMedia;
  const sources = new Map([
    ['https://old.test/caf%C3%A9-scaled.png?token=keep', media],
  ]);
  const urls = [
    'https://old.test/cafe\u0301.png?token=keep&ver=1',
    'https://old.test/caf%C3%A9-1024x380.png?token=keep&v=2',
    'https://old.test/caf%C3%A9-scaled-1024x380.png?token=keep',
    'https://old.test/caf%C3%A9-1024x380.other.png?token=keep',
    'https://old.test/caf%C3%A9.png?token=different',
  ];
  const doc: ContentDocument = {
    type: 'doc',
    content: urls.map((src) => ({ type: 'image', attrs: { src } })),
  };
  rewriteMedia(doc, sources);
  expect(
    doc.content?.map((node) => (node.attrs as { src: string }).src),
  ).toEqual([
    '/media/local.png',
    '/media/size.webp',
    '/media/size.webp',
    urls[3]!,
    urls[4]!,
  ]);
  const reverse: ContentDocument = {
    type: 'doc',
    content: [
      {
        type: 'image',
        attrs: { src: 'https://old.test/caf%C3%A9-scaled.png?ver=1' },
      },
    ],
  };
  rewriteMedia(reverse, new Map([['https://old.test/café.png', media]]));
  expect(reverse.content?.[0]?.attrs).toMatchObject({ mediaId: 'local' });
});
