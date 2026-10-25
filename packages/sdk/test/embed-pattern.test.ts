import { expect, test } from 'bun:test';
import { compileEmbedPattern } from '#sdk/embed-pattern';
import { DEFAULT_EMBED_PROVIDERS } from '#sdk/embeds';

test('RE2 supports both named group spellings and optional captures', () => {
  for (const source of ['^(?<id>a)(?<rest>b)?', '^(?P<id>a)(?P<rest>b)?'])
    expect(compileEmbedPattern(source)?.match('a')).toEqual({
      id: 'a',
      rest: null,
    });
});

test('review patterns reject or match a 2048-character near miss within 50ms', () => {
  const url = 'https://a/' + 'a'.repeat(2048 - 'https://a/'.length);
  for (const source of [
    '^https://a/(?<x>[a-z]*[a-z]*[a-z]*)!$',
    '^https://a/(?<x>(?:(a|a)?){0,1000})!$',
    '^https://a/(?<x>(?:a+){0,1000})!$',
    '^https://a/(?=(a+)+!)(?<x>a+)!$',
    '^https://a/(?<x>(a+)+)!$',
  ]) {
    const matcher = compileEmbedPattern(source);
    const start = performance.now();
    expect(matcher?.match(url) ?? null).toBeNull();
    expect(performance.now() - start).toBeLessThan(50);
  }
});

test('all unchanged default providers match their documented URL forms', () => {
  const urls: Record<string, string[]> = {
    youtube: [
      'https://youtu.be/aqz-KE-bpKQ',
      'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
      ...['shorts', 'embed', 'live'].map(
        (kind) => `https://m.youtube.com/${kind}/aqz-KE-bpKQ`,
      ),
    ],
    vimeo: [
      'https://vimeo.com/76979871',
      'https://www.vimeo.com/76979871?share=copy',
    ],
    x: [
      'https://x.com/jack/status/20',
      'https://twitter.com/jack/status/20?s=20',
      'https://mobile.twitter.com/jack/status/20',
      'https://www.x.com/i/web/status/20',
    ],
    instagram: ['p', 'reel', 'tv'].map(
      (kind) => `https://instagram.com/${kind}/C1a_b-3?igsh=x`,
    ),
  };
  for (const provider of DEFAULT_EMBED_PROVIDERS)
    for (const url of urls[provider.id]!)
      expect(compileEmbedPattern(provider.urlPattern)?.match(url)).toBeTruthy();
});
