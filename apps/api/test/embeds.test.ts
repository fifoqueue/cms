import { describe, expect, test } from 'bun:test';
import {
  DEFAULT_EMBED_PRESETS,
  Embeds,
  presetProvider,
} from '#api/domain/content/embeds';
import type { EmbedPreset } from '#api/domain/content/embeds';

/** The figure the editor stores for an embed block. */
const figure = (url: string) => {
  const escaped = url.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  return `<figure data-embed-url="${escaped}" class="embed"><a href="${escaped}">${escaped}</a></figure>`;
};

const core = new Embeds(() => DEFAULT_EMBED_PRESETS.map(presetProvider));
const expand = (url: string, embeds = core) => embeds.expand(figure(url));
const srcOf = async (url: string, embeds = core) =>
  /<iframe src="([^"]*)"/.exec(await expand(url, embeds))?.[1] ?? null;

describe('default embed presets', () => {
  test('YouTube accepts short, watch, shorts, embed and live addresses on the privacy domain', async () => {
    const id = 'aqz-KE-bpKQ';
    const player = `https://www.youtube-nocookie.com/embed/${id}`;
    for (const url of [
      `https://youtu.be/${id}`,
      `https://www.youtube.com/watch?v=${id}`,
      `https://m.youtube.com/watch?feature=share&v=${id}`,
      `https://youtube.com/shorts/${id}`,
      `https://www.youtube.com/embed/${id}`,
      `https://www.youtube.com/live/${id}?si=x`,
    ])
      expect(await srcOf(url)).toBe(player);
    for (const url of [
      'https://youtu.be/short',
      'https://www.youtube.com/watch?v=tooShortId',
      `https://www.youtube.com/channel/${id}`,
      `https://notyoutube.com/watch?v=${id}`,
    ])
      expect(await srcOf(url)).toBeNull();
  });

  test('YouTube keeps a 16:9 player with the media permissions', async () => {
    const html = await expand('https://youtu.be/aqz-KE-bpKQ');
    expect(html).toBe(
      '<figure class="embed"><iframe src="https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ" title="YouTube video" loading="lazy" allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin" style="aspect-ratio: 16 / 9; width: 100%; border: 0"></iframe></figure>',
    );
  });

  test('Vimeo plays without tracking', async () => {
    for (const url of [
      'https://vimeo.com/76979871',
      'https://www.vimeo.com/76979871?share=copy',
    ])
      expect(await srcOf(url)).toBe(
        'https://player.vimeo.com/video/76979871?dnt=1',
      );
    expect(await srcOf('https://vimeo.com/channels/staffpicks')).toBeNull();
  });

  test('X accepts x.com, twitter.com, mobile and web status addresses', async () => {
    for (const url of [
      'https://x.com/jack/status/20',
      'https://twitter.com/jack/status/20?s=20',
      'https://mobile.twitter.com/jack/status/20',
      'https://www.x.com/i/web/status/20',
    ])
      expect(await srcOf(url)).toBe(
        'https://platform.twitter.com/embed/Tweet.html?id=20&amp;dnt=true',
      );
    expect(await srcOf('https://x.com/jack')).toBeNull();
    expect(await srcOf('https://x.com/jack/status/abc')).toBeNull();
  });

  test('X and Instagram start at a fixed height the page script can resize', async () => {
    expect(await expand('https://x.com/jack/status/20')).toBe(
      '<figure class="embed"><iframe src="https://platform.twitter.com/embed/Tweet.html?id=20&amp;dnt=true" title="X post" loading="lazy" data-embed-height-path="/twttr.embed/params/0/height" allowfullscreen referrerpolicy="strict-origin-when-cross-origin" style="height: 600px; width: 100%; border: 0"></iframe></figure>',
    );
    const instagram = await expand('https://www.instagram.com/p/C1a2b3/');
    expect(instagram).toContain('data-embed-height-path="/details/height"');
    expect(instagram).toContain(
      'style="height: 700px; width: 100%; border: 0"',
    );
  });

  test('Instagram accepts posts, reels and TV', async () => {
    for (const kind of ['p', 'reel', 'tv'])
      expect(await srcOf(`https://instagram.com/${kind}/C1a_b-3?igsh=x`)).toBe(
        `https://www.instagram.com/${kind}/C1a_b-3/embed/`,
      );
    expect(await srcOf('https://www.instagram.com/someone/')).toBeNull();
  });

  test('an unknown address stays a plain link', async () => {
    const stored = figure('https://example.com/watch?v=aqz-KE-bpKQ');
    expect(await core.expand(stored)).toBe(stored);
  });
});

describe('presetProvider', () => {
  const custom = (preset: Partial<EmbedPreset>) =>
    new Embeds(() => [
      presetProvider({
        id: 'custom',
        urlPattern: '^https://example\\.com/(?<path>.*)$',
        src: 'https://player.example/{path}',
        title: 'Custom',
        ratio: '4 / 3',
        ...preset,
      } as EmbedPreset),
    ]);

  test('escapes attributes and URL-encodes only marked placeholders', async () => {
    const embeds = custom({
      urlPattern: '^(?<url>https://example\\.com/(?<id>[\\w-]+)\\?.*)$',
      src: 'https://player.example/{id}?q=1&u={url|urlencode}',
      title: 'Say "hi" <now> & later',
      allow: 'fullscreen',
    });
    const html = await expand('https://example.com/a?x=1&y=2', embeds);
    expect(html).toContain(
      'src="https://player.example/a?q=1&amp;u=https%3A%2F%2Fexample.com%2Fa%3Fx%3D1%26y%3D2"',
    );
    expect(html).toContain('title="Say &quot;hi&quot; &lt;now> &amp; later"');
    expect(html).toContain('allow="fullscreen"');
    expect(html).not.toContain('data-embed-height-path');
  });

  test('filters permissions again when rendering unvalidated presets', async () => {
    const html = await expand(
      'https://example.com/a',
      custom({
        allow:
          'camera *; autoplay; microphone *; fullscreen https://example.com; web-share; fullscreen "x"',
      }),
    );
    expect(html).toContain(' allow="autoplay; web-share"');
    expect(html).not.toContain('camera');
    expect(html).not.toContain('microphone');
  });

  test('never matches URLs longer than 2048 characters, including normalized hrefs', async () => {
    const provider = presetProvider({
      id: 'length',
      urlPattern: '^https://example\\.com/(?<path>.*)$',
      src: 'https://player.example/{path|urlencode}',
      title: 'Length',
      ratio: '16 / 9',
    });
    const boundary =
      'https://example.com/' + 'a'.repeat(2048 - 'https://example.com/'.length);
    expect(await provider.render(new URL(boundary))).not.toBeNull();
    for (const url of [
      boundary + 'a',
      'https://example.com/' + '한'.repeat(300),
    ]) {
      expect(await provider.render(new URL(url))).toBeNull();
      const embeds = new Embeds(() => [
        {
          name: 'must-not-run',
          render() {
            throw new Error('Oversized URL reached a provider');
          },
        },
      ]);
      expect(await embeds.expand(figure(url))).toBe(figure(url));
    }
  });

  test('captures cannot move the address off its origin or segment', async () => {
    const preset = (src: string) =>
      custom({ urlPattern: '^https://example\\.com/(?<v>.*)$', src });
    // Host change through a raw capture next to the authority.
    expect(
      await srcOf(
        'https://example.com/@attacker.example',
        preset('https://player.example{v}/embed'),
      ),
    ).toBeNull();
    // Raw delimiters, and `..` even when encoded.
    expect(
      await srcOf(
        'https://example.com/../admin?mode=edit',
        preset('https://player.example/v/{v}'),
      ),
    ).toBeNull();
    expect(
      await srcOf(
        'https://example.com/x?v=..',
        custom({
          urlPattern: '^https://example\\.com/x\\?v=(?<v>.*)$',
          src: 'https://player.example/v/{v|urlencode}',
        }),
      ),
    ).toBeNull();
    expect(
      await srcOf(
        'https://example.com/a/b',
        preset('https://player.example/v?u={v|urlencode}'),
      ),
    ).toBe('https://player.example/v?u=a%2Fb');
  });

  test('declines a missing capture or a non-https address', async () => {
    expect(
      await srcOf(
        'https://example.com/a',
        custom({
          urlPattern: '^https://example\\.com/(?<path>a)(?<rest>/b)?',
          src: 'https://player.example/{path}{rest}',
        }),
      ),
    ).toBeNull();
    expect(
      await srcOf(
        'https://example.com/a',
        custom({
          urlPattern: '^https://example\\.com/(a)$',
          src: 'https://player.example/{1}',
        }),
      ),
    ).toBeNull();
    expect(
      await srcOf(
        'https://example.com/a',
        custom({ src: 'http://player.example/{path}' }),
      ),
    ).toBeNull();
    expect(
      await srcOf(
        'https://example.com/a',
        custom({ src: 'javascript:alert({path})' }),
      ),
    ).toBeNull();
  });
});
