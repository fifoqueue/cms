import { expect, test } from 'bun:test';
import { SEO_SETTINGS_DEFAULTS } from '@cms/sdk';
import { SeoSettingsService } from '#api/domain/seo/seo-settings-service';
import { HookBus } from '#api/plugin-runtime/hook-bus';
import { MemoryJsonSettings } from '#test/support/json-settings';
import { discoveryFilterSchemas } from '@cms/sdk/plugin';

test('SEO hooks validate output and notify only after persistence', async () => {
  const settings = new MemoryJsonSettings();
  const hooks = new HookBus({
    timeoutMs: 20,
    logger: { info() {}, warn() {}, error() {} },
  });
  const service = new SeoSettingsService(settings, hooks);
  const registrar = hooks.registrar('test');
  let notified = false;
  registrar.on('seo.updated', (dto) => {
    expect(settings.values.has('seo')).toBe(true);
    expect(dto).toEqual(SEO_SETTINGS_DEFAULTS);
    notified = true;
  });
  registrar.filter('seo.beforeSave', () => {
    throw new Error('provider failed');
  });
  registrar.filter('seo.public', (dto) => ({
    ...dto,
    unexpectedSecret: 'must not escape',
  }));
  expect(await service.update({})).toEqual(SEO_SETTINGS_DEFAULTS);
  expect(notified).toBe(true);
  expect(await service.getPublic()).toEqual(SEO_SETTINGS_DEFAULTS);
});

test('every discovery filter receives the DTO and ignores malformed output', async () => {
  const hooks = new HookBus({
    timeoutMs: 20,
    logger: { info() {}, warn() {}, error() {} },
  });
  const service = new SeoSettingsService(new MemoryJsonSettings(), hooks);
  const samples = {
    'seo.markdown': '# Published page\n\nBody',
    'sitemap.entries': [],
    'feed.items': [],
    'feed.channel': {
      title: 'Site',
      link: 'https://example.com',
      description: '',
    },
    'robots.txt': 'User-agent: *',
    'llms.txt': '# Site',
    'seo.meta': {
      title: 'Page',
      description: '',
      canonicalUrl: 'https://example.com',
      og: {},
      jsonLd: [],
    },
  };
  for (const kind of Object.keys(samples) as (keyof typeof samples)[]) {
    const value = samples[kind];
    let called = false;
    hooks.registrar('test').filter(kind, (dto) => {
      expect(dto).toEqual(value);
      called = true;
      return null as never;
    });
    expect(await service.filterOutput({ kind, value })).toEqual(value);
    expect(called).toBe(true);
    expect(discoveryFilterSchemas[kind].safeParse(value).success).toBe(true);
  }
});
