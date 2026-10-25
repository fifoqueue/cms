import { expect, test } from 'bun:test';
import { themeEditorSchema } from '@cms/sdk';
import type { PluginContext, PatternContributions } from '@cms/sdk/plugin';
import {
  patternContributionSchema,
  themeContributionSchema,
} from '@cms/sdk/plugin';
import {
  createSearchProviders,
  createSitemapProviders,
  createThemeContributions,
} from '#api/plugin-runtime/discovery-providers';
import { ProviderRegistry } from '#api/plugin-runtime/provider-registry';
import {
  PublicContentService,
  PublishedContentReader,
} from '#api/domain/content/public-content';
import { SeoSettingsService } from '#api/domain/seo/seo-settings-service';
import { SeoDiscoveryService } from '#api/domain/seo/seo-discovery-service';
import { ThemeService } from '#api/domain/theme/theme-service';
import { HookBus } from '#api/plugin-runtime/hook-bus';
import { zipThemeArchive } from '#api/infra/zip-theme-archive';
import { tiptapRenderer } from '#api/infra/system';
import { Embeds } from '#api/domain/content/embeds';
import { MemoryJsonSettings } from '#test/support/json-settings';
import { MemoryPublishedContentRepository } from '#test/support/memory-published';
import {
  ADMIN,
  MemoryContentRepository,
  recordingLogger,
  testFields,
  testTypes,
  testLocks,
} from '#test/support/memory';
import { testContentService, textDocument } from '#test/support/content';
import { createRuntime } from '#test/support/runtime';

const options = () => ({ timeoutMs: 20, logger: recordingLogger().logger });

test('production sitemap wiring propagates a slow core DB failure through the service', async () => {
  const failure = new Error('database unavailable');
  const repository = {
    list: async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      throw failure;
    },
  };
  const providers = createSitemapProviders(repository, {
    ...options(),
    timeoutMs: 1,
  });
  providers.register('broken-plugin', 'content', () => {
    throw new Error('plugin failed');
  });
  const settings = new SeoSettingsService(new MemoryJsonSettings());
  await settings.update({
    indexingEnabled: true,
    siteUrl: 'https://example.com',
  });
  const service = new SeoDiscoveryService(repository, settings, providers);
  expect(service.providersList()).toEqual([
    'content',
    'category',
    'tag',
    'author',
    'taxonomy',
  ]);
  await expect(service.list({ kind: 'content' })).rejects.toBe(failure);
});

test('production search wiring parses plugin args, caps IDs, and rechecks publication', async () => {
  const repository = new MemoryContentRepository();
  const writer = testContentService({ repository });
  const entries: Awaited<ReturnType<typeof writer.create>>[] = [];
  for (const [title, status] of [
    ['Draft', 'draft'],
    ['First', 'published'],
    ['Private', 'private'],
    ['Second', 'published'],
    ['Overflow', 'published'],
  ] as const)
    entries.push(
      await writer.create(
        {
          type: 'post',
          title,
          status,
          document: textDocument(title),
        },
        ADMIN,
      ),
    );
  const published = new MemoryPublishedContentRepository(repository);
  const hooks = new HookBus(options());
  const { registry, lookup } = createSearchProviders(
    {
      find: async () => {
        throw new Error('plugin should answer first');
      },
    },
    options(),
  );
  let calls = 0;
  const expectedTypes = (await testTypes().list())
    .filter((type) => type.searchable)
    .map((type) => type.key);
  registry.register('plugin', 'custom', (query) => {
    calls++;
    expect(query).toEqual({
      text: 'needle',
      types: expectedTypes,
      page: 1,
      pageSize: 4,
    });
    return { ids: entries.map((entry) => entry.id), total: entries.length };
  });
  const service = new PublicContentService(
    new PublishedContentReader(published),
    hooks,
    testLocks(published),
    new Embeds(() => []),
    testFields(),
    testTypes(),
    lookup,
  );
  const result = await service.list({
    search: 'needle',
    pageSize: 4,
    status: 'draft',
  });
  expect(result.items.map((item) => item.id)).toEqual([
    entries[1]!.id,
    entries[3]!.id,
  ]);
  expect(calls).toBe(1);
});

test('production search database fallback hydrates summaries once', async () => {
  const published = new MemoryPublishedContentRepository(
    new MemoryContentRepository(),
  );
  const original = published.summaries.bind(published);
  let reads = 0;
  published.summaries = (query) => {
    reads++;
    return original(query);
  };
  published.summariesByIds = async () => {
    throw new Error('unexpected second hydration');
  };
  const { lookup } = createSearchProviders(
    { find: async () => null },
    options(),
  );
  const service = new PublicContentService(
    new PublishedContentReader(published),
    new HookBus(options()),
    testLocks(published),
    new Embeds(() => []),
    testFields(),
    testTypes(),
    lookup,
  );
  expect((await service.list({ search: 'needle' })).items).toEqual([]);
  expect(reads).toBe(1);
});

test('production theme wiring keeps theme and admin values ahead of plugin contributions', async () => {
  const registry = createThemeContributions(options());
  const themes = new ThemeService(
    new MemoryJsonSettings(),
    zipThemeArchive,
    undefined,
    undefined,
    registry,
  );
  const original = await themes.getPublic();
  const part = original.parts[0]!;
  registry.register('plugin', 'overrides', () =>
    themeContributionSchema.parse({
      templates: {
        index: [{ name: 'site-title' }],
        'single-added': [{ name: 'site-title' }],
      },
      parts: [
        { ...part, blocks: [{ name: 'site-title' }] },
        {
          slug: 'added',
          area: 'uncategorized',
          blocks: [{ name: 'site-title' }],
        },
      ],
    }),
  );
  const contributed = await themes.getPublic();
  expect(contributed.templates.index).toEqual(original.templates.index);
  expect(contributed.parts.find((entry) => entry.slug === part.slug)).toEqual(
    part,
  );
  expect(contributed.templates['single-added']).toBeDefined();
  expect(contributed.parts.some((entry) => entry.slug === 'added')).toBe(true);
  const editor = await themes.editor(original.id);
  expect(themeEditorSchema.safeParse(editor).success).toBe(true);
  expect(
    editor.templates.find((entry) => entry.name === 'single-added'),
  ).toMatchObject({
    source: 'plugin',
    readOnly: true,
    inTheme: false,
  });
  expect(editor.parts.find((entry) => entry.slug === 'added')).toMatchObject({
    source: 'plugin',
    readOnly: true,
  });
  await themes.savePart(original.id, 'added', {
    blocks: [{ name: 'query-title' }],
  });
  expect(
    (await themes.editor(original.id)).parts.find(
      (entry) => entry.slug === 'added',
    ),
  ).toMatchObject({
    source: 'plugin',
    readOnly: false,
    customized: true,
  });
  await themes.saveTemplate(original.id, 'index', {
    blocks: [{ name: 'query-title' }],
  });
  await themes.savePart(original.id, part.slug, {
    blocks: [{ name: 'query-title' }],
  });
  const customized = await themes.getPublic();
  expect(customized.templates.index?.[0]?.name).toBe('query-title');
  expect(
    customized.parts.find((entry) => entry.slug === part.slug)?.blocks[0]?.name,
  ).toBe('query-title');
});

test('plugin pattern registration checks block attributes and invokes the editor renderer atomically', async () => {
  const patterns = new ProviderRegistry<null, PatternContributions>(
    patternContributionSchema,
    options(),
  );
  let rendered = 0;
  const runtime = createRuntime({
    patterns,
    patternRenderer: {
      render: (document) => {
        rendered++;
        return tiptapRenderer.render(document);
      },
    },
  });
  let context!: PluginContext;
  await runtime.host.install(
    runtime.bundles.register('patterns', {
      manifest: { id: 'patterns', name: 'Patterns', version: '1.0.0' },
      activate(value: PluginContext) {
        context = value;
        value.blocks.register('counter', {
          title: 'Counter',
          attributes: [
            { key: 'count', label: 'Count', type: 'number', default: 1 },
          ],
          render: () => '',
        });
      },
    }),
  );
  expect((await runtime.host.enable('patterns')).status).toBe('active');
  const pattern = {
    title: 'Pattern',
    synced: false,
    status: 'published' as const,
  };
  expect(() =>
    context.patterns.register('bad-attrs', [
      {
        ...pattern,
        document: {
          type: 'doc',
          content: [
            {
              type: 'pluginBlock',
              attrs: {
                block: 'plugin:patterns:counter',
                attrs: { count: 'wrong' },
              },
            },
          ],
        },
      },
    ]),
  ).toThrow();
  expect(rendered).toBe(0);
  expect(() =>
    context.patterns.register('bad-editor', [
      {
        ...pattern,
        document: { type: 'doc', content: [{ type: 'unknownNode' }] },
      },
    ]),
  ).toThrow();
  expect(rendered).toBe(1);
  expect(patterns.keys()).toEqual([]);
  context.patterns.register('valid', [
    { ...pattern, document: textDocument('Valid') },
  ]);
  expect(rendered).toBe(2);
  expect((await patterns.resolve(null, 'valid'))?.[0]?.title).toBe('Pattern');
  await runtime.host.disable('patterns');
  expect(await patterns.resolve(null, 'valid')).toBeNull();
});
