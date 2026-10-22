import type { Awaitable } from '@cms/sdk';

/** Turns an embedded URL into player HTML, or declines with null. */
export interface EmbedProvider {
  name: string;
  render(url: URL): Awaitable<string | null>;
}

/** The marked figure the editor schema renders for an `embed` node. */
const FIGURE =
  /<figure data-embed-url="([^"]*)" class="embed"><a [^>]*>[^<]*<\/a><\/figure>/g;

const unescapeAttribute = (value: string) =>
  value
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');

const escapeAttribute = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

const frame = (src: string, title: string, ratio = '16 / 9') =>
  `<figure class="embed"><iframe src="${escapeAttribute(src)}" title="${escapeAttribute(title)}" loading="lazy" allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin" style="aspect-ratio: ${ratio}; width: 100%; border: 0"></iframe></figure>`;

/** YouTube through its privacy-enhanced domain. */
export const youtube: EmbedProvider = {
  name: 'youtube',
  render(url) {
    const host = url.hostname.replace(/^(www|m)\./, '');
    const id =
      host === 'youtu.be'
        ? url.pathname.slice(1)
        : host === 'youtube.com'
          ? url.pathname === '/watch'
            ? url.searchParams.get('v')
            : /^\/(?:shorts|embed|live)\/([^/]+)/.exec(url.pathname)?.[1]
          : null;
    return id && /^[\w-]{11}$/.test(id)
      ? frame(`https://www.youtube-nocookie.com/embed/${id}`, 'YouTube video')
      : null;
  },
};

/** Vimeo without tracking (`dnt`). */
export const vimeo: EmbedProvider = {
  name: 'vimeo',
  render(url) {
    const id =
      url.hostname.replace(/^www\./, '') === 'vimeo.com'
        ? /^\/(\d{1,12})$/.exec(url.pathname)?.[1]
        : null;
    return id
      ? frame(`https://player.vimeo.com/video/${id}?dnt=1`, 'Vimeo video')
      : null;
  },
};

/**
 * Expands embeds when content is served. Providers are asked in order; the first player wins.
 * Unknown URLs stay plain links, so content never depends on a provider being present.
 */
export class Embeds {
  constructor(
    private readonly providers: () => readonly EmbedProvider[],
    private readonly run: (
      provider: EmbedProvider,
      url: URL,
    ) => Promise<string | null> = async (provider, url) => provider.render(url),
  ) {}

  async expand(html: string): Promise<string> {
    if (!html.includes('data-embed-url')) return html;
    const matches = [...html.matchAll(FIGURE)];
    const players = await Promise.all(
      matches.map(async ([, raw]) => {
        let url: URL;
        try {
          url = new URL(unescapeAttribute(raw ?? ''));
        } catch {
          return null;
        }
        for (const provider of this.providers()) {
          const player = await this.run(provider, url);
          if (player) return player;
        }
        return null;
      }),
    );
    let index = 0;
    return html.replace(FIGURE, (figure) => players[index++] ?? figure);
  }
}
