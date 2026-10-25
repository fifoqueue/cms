import { expect, test } from 'bun:test';
import type { z } from 'zod';
import {
  menuLinkSchema,
  patternContributionSchema,
  themeContributionSchema,
  searchHookResultsSchema,
  sitemapPageSchema,
} from '@cms/sdk/plugin';
import { ProviderRegistry } from '#api/plugin-runtime/provider-registry';
import { PluginScope } from '#api/plugin-runtime/plugin-scope';
import { recordingLogger } from '#test/support/memory';
import { ThemeService } from '#api/domain/theme/theme-service';
import { MemoryJsonSettings } from '#test/support/json-settings';
import { zipThemeArchive } from '#api/infra/zip-theme-archive';
import type {
  ThemeContributionRequest,
  ThemeContribution,
} from '@cms/sdk/plugin';

const cases: { name: string; schema: z.ZodType; value: unknown }[] = [
  {
    name: 'sitemap',
    schema: sitemapPageSchema,
    value: { items: [], total: 0 },
  },
  {
    name: 'search',
    schema: searchHookResultsSchema,
    value: { ids: ['public'], total: 1 },
  },
  { name: 'menu', schema: menuLinkSchema, value: { url: '/', title: 'Home' } },
  { name: 'patterns', schema: patternContributionSchema, value: [] },
  {
    name: 'themes',
    schema: themeContributionSchema,
    value: { templates: {}, parts: [] },
  },
];

for (const { name, schema, value } of cases) {
  test(`${name} providers validate, time out, and fall back after revocation`, async () => {
    const registry = new ProviderRegistry(schema, {
      timeoutMs: 10,
      logger: recordingLogger().logger,
    });
    registry.register('core', 'default', () => value);
    const scope = new PluginScope();
    scope.track(() =>
      registry.register('plugin', 'default', () => {
        throw new Error('failure');
      }),
    );
    scope.track(() =>
      registry.register('plugin', 'default', () => ({ invalid: true })),
    );
    scope.track(() =>
      registry.register('plugin', 'default', () => new Promise(() => {})),
    );
    expect(await registry.resolve(null, 'default')).toEqual(value);
    scope.dispose();
    expect(await registry.resolve(null, 'default')).toEqual(value);
    expect(() =>
      scope.track(() => registry.register('plugin', 'late', () => value)),
    ).toThrow();
    let release!: (value: unknown) => void;
    let started!: () => void;
    const entered = new Promise<void>((resolve) => {
      started = resolve;
    });
    const pendingScope = new PluginScope();
    pendingScope.track(() =>
      registry.register(
        'plugin',
        'default',
        () =>
          new Promise((resolve) => {
            release = resolve;
            started();
          }),
      ),
    );
    const pending = registry.resolve(null, 'default');
    await entered;
    pendingScope.dispose();
    release({ invalid: true });
    expect(await pending).toEqual(value);
  });
}

test('theme contributions disappear on disable without modifying persisted customization', async () => {
  const registry = new ProviderRegistry<
    ThemeContributionRequest,
    ThemeContribution
  >(themeContributionSchema, {
    timeoutMs: 20,
    logger: recordingLogger().logger,
  });
  registry.register('core', 'core', (query) => query.base);
  const settings = new MemoryJsonSettings();
  const themes = new ThemeService(
    settings,
    zipThemeArchive,
    undefined,
    undefined,
    registry,
  );
  const before = await themes.getPublic();
  const unregister = registry.register('plugin', 'banner', () =>
    themeContributionSchema.parse({
      templates: { 'single-contributed': [{ name: 'site-title' }] },
      parts: [
        {
          slug: 'plugin-banner',
          area: 'uncategorized',
          blocks: [{ name: 'site-title' }],
        },
      ],
    }),
  );
  expect(
    (await themes.getPublic()).templates['single-contributed'],
  ).toBeDefined();
  unregister();
  expect(await themes.getPublic()).toEqual(before);
  expect(settings.writes).toBe(0);
});
