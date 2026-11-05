import { expect, test } from 'bun:test';
import { SEO_SETTINGS_DEFAULTS } from '@cms/sdk';
import { SeoSettingsService } from '#api/domain/seo/seo-settings-service';
import { SeoDiscoveryService } from '#api/domain/seo/seo-discovery-service';
import { PublicationPush } from '#api/domain/seo/publication-push';
import { publicationTransport } from '#api/infra/publication-transport';
import { HookBus } from '#api/plugin-runtime/hook-bus';
import { ADMIN, MemorySettings, recordingLogger } from '#test/support/memory';
import { testContentService, textDocument } from '#test/support/content';

test('discovery filters receive context, isolate invalid plugins, and disappear on disposal', async () => {
  const bus = new HookBus({ timeoutMs: 100, logger: recordingLogger().logger });
  const seo = new SeoSettingsService(new MemorySettings(), bus);
  const context = { id: 'entry', slug: 'post', path: '/post', type: 'post' };
  const hooks = bus.registrar('discovery-test', { trusted: true });
  const dispose = hooks.filter('seo.markdown', (text, received) => {
    expect(received).toEqual(context);

    return `${text}\nAdjusted`;
  });

  expect(
    await seo.filterOutput({ kind: 'seo.markdown', value: 'Body', context }),
  ).toBe('Body\nAdjusted');
  dispose();
  expect(
    await seo.filterOutput({ kind: 'seo.markdown', value: 'Body', context }),
  ).toBe('Body');
  hooks.filter('discovery.document', () => {
    throw new Error('offline');
  });
  expect(
    await seo.filterOutput({
      kind: 'discovery.document',
      value: null,
      context: { path: '/verification.txt' },
    }),
  ).toBeNull();
  const meta = {
    title: 'Title',
    description: 'Description',
    canonicalUrl: '/',
    og: {
      'og:image': ['https://example.test/a.jpg', 'https://example.test/b.jpg'],
    },
    robots: 'index, follow',
    links: [],
    jsonLd: [],
  };
  const removeMeta = hooks.filter('seo.meta', (value) => ({
    ...value,
    robots: 'noindex, follow',
    links: [{ rel: 'alternate', href: '/translated' }],
  }));

  expect(
    await seo.filterOutput({ kind: 'seo.meta', value: meta }),
  ).toMatchObject({
    robots: 'noindex, follow',
    og: meta.og,
    links: [{ rel: 'alternate', href: '/translated' }],
  });
  removeMeta();
  const invalidMeta = hooks.filter('seo.meta', (value) => ({
    ...value,
    links: [{ rel: 'alternate', href: 'javascript:alert(1)' }],
  }));

  expect(await seo.filterOutput({ kind: 'seo.meta', value: meta })).toEqual(
    meta,
  );
  invalidMeta();
  expect(await seo.filterOutput({ kind: 'seo.meta', value: meta })).toEqual(
    meta,
  );
  const remove = hooks.filter('discovery.document', (_value, received) => ({
    body: received.path === '/verification.txt' ? 'verified' : 'other',
  }));

  expect(
    await seo.filterOutput({
      kind: 'discovery.document',
      value: null,
      context: { path: '/verification.txt' },
    }),
  ).toEqual({ body: 'verified' });
  remove();
  expect(
    await seo.filterOutput({
      kind: 'discovery.document',
      value: null,
      context: { path: '/verification.txt' },
    }),
  ).toBeNull();
});

test('custom taxonomy discovery obeys indexTags and IndexNow keys survive concurrent saves', async () => {
  const store = new MemorySettings();
  let generated = 0;
  const settings = new SeoSettingsService(store, undefined, {
    transactions: store,
    generate: () => (++generated).toString(16).padStart(32, '0'),
  });
  const saves = await Promise.all([
    settings.update({ indexNowEnabled: true, indexTags: false }),
    settings.update({
      indexNowEnabled: true,
      indexTags: false,
      indexNowKey: 'f'.repeat(32),
    }),
  ]);

  expect(saves[0]!.indexNowKey).toBe('0'.repeat(31) + '1');
  expect(saves[1]!.indexNowKey).toBe(saves[0]!.indexNowKey);
  let queries = 0;
  const discovery = new SeoDiscoveryService(
    {
      list: async () => {
        queries++;

        return { items: [], total: 3 };
      },
    },
    settings,
  );

  expect((await discovery.list({ kind: 'taxonomy' })).total).toBe(0);
  expect(queries).toBe(0);
  expect((await discovery.list({ kind: 'category' })).total).toBe(3);
});

test('archive SEO survives settings storage and controls public discovery', async () => {
  const settings = new SeoSettingsService(new MemorySettings());

  await settings.update({
    archiveOverrides: [
      { kind: 'author', key: 'hidden', noIndex: true },
      {
        kind: 'archive',
        key: 'article',
        title: 'Research',
        description: 'Research papers',
      },
    ],
  });
  expect((await settings.getPublic()).archiveOverrides).toHaveLength(2);
  const discovery = new SeoDiscoveryService(
    {
      list: async () => ({
        items: [
          {
            path: '/author/hidden',
            title: 'Hidden',
            description: '',
            updatedAt: new Date('2026-01-01T00:00:00Z'),
          },
          {
            path: '/archive/article',
            title: 'Articles',
            description: '',
            updatedAt: new Date('2026-01-01T00:00:00Z'),
          },
        ],
        total: 2,
      }),
    },
    settings,
  );

  expect((await discovery.list({ kind: 'author' })).items).toEqual([
    {
      path: '/archive/article',
      title: 'Research',
      description: 'Research papers',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ]);
});

test('publication delivery is nonblocking, sends previous URLs, and isolates failures', async () => {
  const entry = await testContentService().create(
    {
      type: 'post',
      title: 'Public',
      status: 'published',
      document: textDocument('Body'),
    },
    ADMIN,
  );
  const calls: { urls: readonly string[] }[] = [];
  const hubCalls: string[] = [];
  const gate = Promise.withResolvers<void>();
  const started = Promise.withResolvers<void>();
  const finished = Promise.withResolvers<void>();
  const { logger, lines } = recordingLogger();
  const settings = {
    ...SEO_SETTINGS_DEFAULTS,
    siteUrl: 'https://example.test',
    indexNowEnabled: true,
    indexNowKey: 'a'.repeat(32),
    webSubHub: 'https://hub.example/',
  };
  const push = new PublicationPush(
    async () => settings,
    {
      indexNow: async (_origin, _key, urls) => {
        calls.push({ urls });
        started.resolve();
        await gate.promise;
        finished.resolve();
      },
      webSub: async (_hub, feed) => {
        hubCalls.push(feed);
      },
    },
    logger,
  );
  const bus = new HookBus({ timeoutMs: 100, logger });

  push.subscribe(bus.core('test'));
  await bus.emit('content.published', entry);
  await started.promise;
  expect(calls[0]!.urls).toEqual([`https://example.test${entry.path}`]);
  gate.resolve();
  await finished.promise;
  await push.notify([entry, { ...entry, path: '/renamed' }]);
  expect(calls[1]!.urls).toEqual([
    `https://example.test${entry.path}`,
    'https://example.test/renamed',
  ]);
  expect(hubCalls).toContain('https://example.test/feed.xml');
  const failing = new PublicationPush(
    async () => settings,
    {
      indexNow: async () => {
        throw new Error('egress denied');
      },
      webSub: async () => {
        hubCalls.push('delivered');
      },
    },
    logger,
  );

  await failing.notify([entry]);
  expect(hubCalls).toContain('delivered');
  expect(lines.some((line) => line.includes('notification skipped'))).toBe(
    true,
  );
  settings.indexingEnabled = false;
  await push.notify([entry]);
  expect(calls).toHaveLength(2);
});

test('notification adapter uses IndexNow ownership proof and WebSub form encoding', async () => {
  const requests: Request[] = [];
  const transport = publicationTransport(async (input, init) => {
    requests.push(new Request(input, init));

    return new Response(null, { status: 202 });
  });

  await transport.indexNow('https://site.example', 'key', [
    'https://site.example/post',
  ]);
  await transport.webSub(
    'https://hub.example/',
    'https://site.example/feed.xml',
  );
  expect(await requests[0]!.json()).toEqual({
    host: 'site.example',
    key: 'key',
    keyLocation: 'https://site.example/indexnow-key.txt',
    urlList: ['https://site.example/post'],
  });
  expect(new URLSearchParams(await requests[1]!.text()).get('hub.url')).toBe(
    'https://site.example/feed.xml',
  );
  expect(requests[0]!.redirect).toBe('error');
});
