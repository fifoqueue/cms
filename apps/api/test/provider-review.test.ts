import { expect, test } from 'bun:test';
import { discoveryFilterSchemas, sitemapPageSchema } from '@cms/sdk/plugin';
import { ProviderRegistry } from '#api/plugin-runtime/provider-registry';

test('core provider failures propagate instead of producing empty sitemaps', async () => {
  const providers = new ProviderRegistry(sitemapPageSchema, {
    timeoutMs: 1,
    logger: { info() {}, warn() {}, error() {} },
  });
  providers.register(
    'core',
    'content',
    async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      throw new Error('database unavailable');
    },
    true,
  );
  await expect(providers.resolve(null, 'content')).rejects.toThrow(
    'database unavailable',
  );
});

test('SEO output rejects unsafe URLs and non-JSON structured data', () => {
  const meta = {
    title: '',
    description: '',
    canonicalUrl: '/page',
    og: {},
    jsonLd: [],
  };
  const schema = discoveryFilterSchemas['seo.meta'];
  expect(schema.safeParse(meta).success).toBe(true);
  expect(
    schema.safeParse({ ...meta, canonicalUrl: 'javascript:alert(1)' }).success,
  ).toBe(false);
  expect(
    schema.safeParse({ ...meta, og: { 'og:image': '//evil.test/image' } })
      .success,
  ).toBe(false);
  expect(
    schema.safeParse({ ...meta, jsonLd: [{ fn: () => null }] }).success,
  ).toBe(false);
});
