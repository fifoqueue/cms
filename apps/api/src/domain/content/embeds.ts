import type { Awaitable } from '@cms/sdk';
import { compileEmbedPattern } from '@cms/sdk/embed-pattern';
import { embedPermissions, MAX_EMBED_URL_LENGTH } from '@cms/sdk';
import type { BlockRenderContext } from '@cms/sdk/plugin';

/** Turns stored body HTML into what is served (players, plugin blocks, responsive images). */
export interface HtmlExpander {
  /** `context` names the entry being served, for plugin blocks. */
  expand(html: string, context?: BlockRenderContext): Promise<string>;
}

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

/**
 * A declarative iframe embed. `urlPattern` is matched against the whole `url.href`; its named
 * captures fill `{name}` (inserted as captured) or `{name|urlencode}` placeholders in `src`.
 */
export type EmbedPreset = {
  id: string;
  /** Regular expression source with named capture groups. */
  urlPattern: string;
  /** Iframe address template; must produce an https URL. */
  src: string;
  title: string;
  /** Iframe `allow` permissions. */
  allow?: string;
} & (
  | { /** CSS aspect ratio, e.g. `16 / 9`. */ ratio: string }
  | {
      /** Initial height in px. */
      height: number;
      /**
       * JSON Pointer to the height inside the frame's `postMessage` data; the page script resizes
       * the iframe from it.
       */
      heightMessagePath?: string;
    }
);

const PLACEHOLDER = /\{(\w+)(\|urlencode)?\}/g;

const frame = (src: string, preset: EmbedPreset) => {
  const permissions = embedPermissions(preset.allow ?? '').join('; ');
  const allow = permissions ? ` allow="${permissions}"` : '';
  const heightPath =
    'heightMessagePath' in preset && preset.heightMessagePath !== undefined
      ? ` data-embed-height-path="${escapeAttribute(preset.heightMessagePath)}"`
      : '';
  const size =
    'ratio' in preset
      ? `aspect-ratio: ${preset.ratio}`
      : `height: ${preset.height}px`;
  return `<figure class="embed"><iframe src="${escapeAttribute(src)}" title="${escapeAttribute(preset.title)}" loading="lazy"${allow}${heightPath} allowfullscreen referrerpolicy="strict-origin-when-cross-origin" style="${escapeAttribute(`${size}; width: 100%; border: 0`)}"></iframe></figure>`;
};

/** A value inserted as captured stays inside one path segment or query value. */
const RAW_VALUE = /^[\w.~-]+$/;

/**
 * An embed provider from a preset; declines URLs that do not match or yield no https address.
 * Captures cannot move the address: the template's origin is fixed before its first placeholder,
 * and no capture may be `.`/`..` or, unencoded, carry URL delimiters.
 */
export const presetProvider = (preset: EmbedPreset): EmbedProvider => {
  const pattern = compileEmbedPattern(preset.urlPattern);
  const head = /^https:\/\/[^/?#{]+(?=[/?#])/.exec(preset.src)?.[0];
  const origin = head && URL.canParse(head) ? new URL(head).origin : null;
  return {
    name: preset.id,
    render(url) {
      if (!origin || url.href.length > MAX_EMBED_URL_LENGTH) return null;
      const groups = pattern?.match(url.href);
      if (!groups) return null;
      let invalid = false;
      const src = preset.src.replace(
        PLACEHOLDER,
        (_, name: string, encode?: string) => {
          const value = groups[name];
          if (
            !value ||
            value === '.' ||
            value === '..' ||
            (!encode && !RAW_VALUE.test(value))
          ) {
            invalid = true;
            return '';
          }
          return encode ? encodeURIComponent(value) : value;
        },
      );
      if (invalid || !URL.canParse(src) || new URL(src).origin !== origin)
        return null;
      return frame(src, preset);
    },
  };
};

const PLAYER_ALLOW =
  'accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen';

/** Embeds the core ships, asked before plugin providers. */
export const DEFAULT_EMBED_PRESETS: readonly EmbedPreset[] = [
  {
    // Privacy-enhanced domain.
    id: 'youtube',
    urlPattern:
      '^https?://(?:(?:www|m)\\.)?(?:youtu\\.be/|youtube\\.com/(?:(?:shorts|embed|live)/|watch\\?(?:[^#]*&)?v=))(?<id>[\\w-]{11})(?:[/?&#]|$)',
    src: 'https://www.youtube-nocookie.com/embed/{id}',
    title: 'YouTube video',
    allow: PLAYER_ALLOW,
    ratio: '16 / 9',
  },
  {
    // Without tracking (`dnt`).
    id: 'vimeo',
    urlPattern: '^https?://(?:www\\.)?vimeo\\.com/(?<id>\\d{1,12})(?:[?#]|$)',
    src: 'https://player.vimeo.com/video/{id}?dnt=1',
    title: 'Vimeo video',
    allow: PLAYER_ALLOW,
    ratio: '16 / 9',
  },
  {
    id: 'x',
    urlPattern:
      '^https?://(?:(?:www|mobile)\\.)?(?:x|twitter)\\.com/(?:\\w+/status|i/web/status)/(?<id>\\d+)(?:[/?#]|$)',
    src: 'https://platform.twitter.com/embed/Tweet.html?id={id}&dnt=true',
    title: 'X post',
    height: 600,
    heightMessagePath: '/twttr.embed/params/0/height',
  },
  {
    id: 'instagram',
    urlPattern:
      '^https?://(?:www\\.)?instagram\\.com/(?<kind>p|reel|tv)/(?<shortcode>[\\w-]+)(?:[/?#]|$)',
    src: 'https://www.instagram.com/{kind}/{shortcode}/embed/',
    title: 'Instagram post',
    height: 700,
    heightMessagePath: '/details/height',
  },
];

/**
 * Expands embeds when content is served. Providers are asked in order; the first player wins.
 * Unknown URLs stay plain links, so content never depends on a provider being present.
 */
export class Embeds {
  constructor(
    private readonly providers: () => Awaitable<readonly EmbedProvider[]>,
    private readonly run: (
      provider: EmbedProvider,
      url: URL,
    ) => Promise<string | null> = async (provider, url) => provider.render(url),
  ) {}

  async expand(html: string): Promise<string> {
    if (!html.includes('data-embed-url')) return html;
    const matches = [...html.matchAll(FIGURE)];
    if (!matches.length) return html;
    const providers = await this.providers();
    const players = await Promise.all(
      matches.map(async ([, raw]) => {
        const href = unescapeAttribute(raw ?? '');
        if (href.length > MAX_EMBED_URL_LENGTH) return null;
        let url: URL;
        try {
          url = new URL(href);
        } catch {
          return null;
        }
        if (url.href.length > MAX_EMBED_URL_LENGTH) return null;
        for (const provider of providers) {
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
