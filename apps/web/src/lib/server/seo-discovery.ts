// Crawler and agent discovery: robots.txt, sitemaps, the RSS feed, llms.txt and Markdown
// alternates. One policy decides what is discoverable, so every endpoint agrees with the API's
// sitemap selection: global indexing on, entry not noindex, no canonical pointing elsewhere.
// Absolute URLs use the configured site origin only, never the request Host header.
import type {
  ContentType,
  PublicContent,
  PublicContentListQuery,
  PublicContentSummary,
  PublicContentType,
  PublicSeoSettings,
  PublicSiteDto,
  SeoSitemapEntry,
} from '@cms/sdk';
import { MEDIA_PATH, SEO_SITEMAP_PAGE_SIZE } from '@cms/sdk';
import type { ContentClient } from '@cms/sdk/client';
import { mapLimit } from '#lib/server/bounded.js';
import { Errors } from '#lib/server/errors.js';
import { contentMarkdown, markdownInline } from '#lib/server/markdown.js';
import { FEED_PATH, markdownPath } from '#lib/seo/paths.js';

/** sitemaps.org limit on sitemaps per index; each chunk holds one API page (≤ 1,000 URLs). */
const SITEMAP_INDEX_LIMIT = 50_000;

/** Entries listed by the feed and llms.txt: a recent selection, not the full corpus. */
export const RECENT_LIMIT = 20;
/** Content types syndicated in the feed when the type list is unavailable. */
export const FEED_TYPES: readonly ContentType[] = ['post', 'article'];

/** Types marked for search and feeds (Content types), except pages. */
export const feedTypes = (types: readonly PublicContentType[] | null) =>
  types
    ? types
        .filter((type) => type.searchable && type.key !== 'page')
        .map((type) => type.key)
    : FEED_TYPES;

/** Never crawled. Each permitted group repeats these, since a named group replaces `*`. */
const PRIVATE_RULES = [
  'Disallow: /admin$',
  'Disallow: /admin/',
  'Disallow: /api/',
];

/** A sitemap provider key as the API registers them (core or plugin). */
export const isSitemapKind = (value: string) =>
  /^[a-z][a-z0-9-]{0,63}$/.test(value);

/** `path` is the API's already encoded canonical route; it is appended unchanged. */
export const absoluteUrl = (origin: string, path: string) => `${origin}${path}`;

/** Same selection as the API sitemap: indexing on, entry indexable, canonical not elsewhere. */
export const isDiscoverable = (
  content: PublicContentSummary,
  settings: PublicSeoSettings,
) =>
  settings.indexingEnabled &&
  !content.seo.noIndex &&
  (!content.seo.canonicalUrl ||
    content.seo.canonicalUrl === absoluteUrl(settings.siteUrl, content.path));

/**
 * The newest discoverable entries. Each type is listed separately with its own latest
 * `limit`, so a busy type cannot hide another; all types when `types` is omitted.
 */
export const loadRecent = async (
  api: ContentClient,
  settings: PublicSeoSettings,
  types?: readonly ContentType[],
  limit = RECENT_LIMIT,
  filter: PublicContentListQuery = {},
) => {
  const lists = await mapLimit(types ?? [undefined], (type) =>
    api.list({ ...filter, type, pageSize: limit }),
  );
  return lists
    .flatMap((list) => list.items)
    .filter((content) => isDiscoverable(content, settings))
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
    .slice(0, limit);
};

const XML_ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
};

/** Text or attribute value for XML 1.0: characters XML cannot carry are dropped, markup escaped. */
export const xmlText = (value: string) =>
  value
    .replace(/[^\t\n\r\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu, '')
    .replace(/[&<>"']/g, (char) => XML_ENTITIES[char] ?? char);

const isoDate = (value: string) => {
  const time = Date.parse(value);
  return Number.isNaN(time) ? undefined : new Date(time).toISOString();
};

const CACHE = 'public, max-age=300';

const textResponse = (body: string, type: string, status = 200) =>
  new Response(body, {
    status,
    headers: {
      'content-type': `${type}; charset=utf-8`,
      'cache-control': status === 200 ? CACHE : 'no-store',
    },
  });

/** Explicit failure instead of URLs built for whatever host the request named. */
export const missingSiteUrl = (resource: string) =>
  textResponse(
    `${resource} is unavailable: set the public site URL in the SEO settings.\n`,
    'text/plain',
    503,
  );

export const notFound = () => textResponse('Not found\n', 'text/plain', 404);

const xmlResponse = (body: string, type = 'application/xml') =>
  textResponse(`<?xml version="1.0" encoding="UTF-8"?>\n${body}\n`, type);

/**
 * Crawl preferences. Search crawlers may fetch every public page, including noindex ones, so
 * they can see the noindex. OpenAI's search crawler (OAI-SearchBot) and training crawler
 * (GPTBot) follow their own settings. robots.txt is a request to compliant crawlers, not
 * access control.
 */
export const robotsTxt = (
  settings: PublicSeoSettings,
  /** The `robots.txt` filter's result; defaults to the generated text. */
  text = robotsText(settings),
) => textResponse(text, 'text/plain');

export const robotsText = (settings: PublicSeoSettings) => {
  const group = (agent: string, allowed: boolean) =>
    [
      `User-agent: ${agent}`,
      ...(allowed ? [...PRIVATE_RULES, 'Allow: /'] : ['Disallow: /']),
    ].join('\n');
  const sections = [
    '# Crawl preferences for compliant crawlers; this file does not restrict access.',
    group('*', true),
    group('OAI-SearchBot', settings.indexingEnabled && settings.allowAiSearch),
    group('GPTBot', settings.indexingEnabled && settings.allowAiTraining),
  ];
  if (settings.indexingEnabled && settings.siteUrl)
    sections.push(`Sitemap: ${absoluteUrl(settings.siteUrl, '/sitemap.xml')}`);
  return `${sections.join('\n\n')}\n`;
};

/** Chunks of `kind`; the content sitemap always exists, since it also lists the home page. */
export const sitemapChunkCount = (kind: string, total: number) =>
  Math.max(
    kind === 'content' ? 1 : 0,
    Math.ceil(total / SEO_SITEMAP_PAGE_SIZE),
  );

/**
 * Sitemap index over every chunk of every provider kind (`GET /api/v1/seo/providers`, core
 * and plugin), in the given order; fails rather than truncating.
 */
export const sitemapIndex = (
  origin: string,
  totals: Readonly<Record<string, number>>,
) => {
  const kinds = Object.keys(totals);
  const counts = kinds.map((kind) => sitemapChunkCount(kind, totals[kind]!));
  // Checked before any list is allocated; a non-numeric count fails the same way.
  if (!(counts.reduce((sum, count) => sum + count, 0) <= SITEMAP_INDEX_LIMIT))
    throw new Error(Errors.SitemapIndexTooLarge, {
      cause: { limit: SITEMAP_INDEX_LIMIT },
    });
  const chunks = kinds.flatMap((kind, index) =>
    Array.from(
      { length: counts[index] ?? 0 },
      (_, page) => `/sitemaps/${kind}/${page + 1}.xml`,
    ),
  );
  const items = chunks.map(
    (path) =>
      `  <sitemap><loc>${xmlText(absoluteUrl(origin, path))}</loc></sitemap>`,
  );
  return xmlResponse(
    [
      '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      ...items,
      '</sitemapindex>',
    ].join('\n'),
  );
};

/** One sitemap chunk. The home page, which has no entry date, is listed without lastmod. */
export const sitemapChunk = (
  origin: string,
  entries: readonly Pick<SeoSitemapEntry, 'path' | 'updatedAt'>[],
  includeHome: boolean,
) => {
  const urls = entries.map(({ path, updatedAt }) => {
    const lastmod = isoDate(updatedAt);
    return `  <url><loc>${xmlText(absoluteUrl(origin, path))}</loc>${
      lastmod ? `<lastmod>${lastmod}</lastmod>` : ''
    }</url>`;
  });
  if (includeHome)
    urls.unshift(
      `  <url><loc>${xmlText(absoluteUrl(origin, '/'))}</loc></url>`,
    );
  return xmlResponse(
    [
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      ...urls,
      '</urlset>',
    ].join('\n'),
  );
};

const AUDIO_TYPES: Record<string, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
};

/** A full-text feed item: its body and the first library audio file (RSS enclosure). */
export interface FeedBody {
  html: string;
  audio: { path: string; type: string; length: number } | null;
}

/** Byte size of a library file by key, or null when unknown. */
export type MediaSize = (key: string) => Promise<number | null>;

/** The first media-library audio file of a body, with its size; others are not described. */
const audioOf = async (html: string, size: MediaSize) => {
  const src = /<audio\b[^>]*\ssrc="([^"]+)"/
    .exec(html)?.[1]
    ?.replace(/&amp;/g, '&');
  const type = AUDIO_TYPES[src?.split('.').pop()?.toLowerCase() ?? ''];
  if (!src?.startsWith(MEDIA_PATH) || !type) return null;
  const length = await size(src.slice(MEDIA_PATH.length));
  return length ? { path: src, type, length } : null;
};

/**
 * Bodies of feed entries by id (Settings → Reading: full text), a few requests at a time.
 * Protected entries are not read: their body stays locked.
 */
export const loadBodies = async (
  api: ContentClient,
  items: readonly PublicContentSummary[],
  size: MediaSize,
) =>
  new Map(
    await mapLimit(
      items.filter((item) => !item.protected),
      async (item) => {
        const html = await api.resolvePath(item.path).then(
          ({ content }) => content.html,
          () => '',
        );
        return [item.id, { html, audio: await audioOf(html, size) }] as const;
      },
    ),
  );

/** Feed readers show bodies elsewhere: site paths become absolute, responsive hints go. */
const absoluteBody = (origin: string, html: string) =>
  html
    .replace(
      /<nav\b[^>]*class="[^"]*\bcms-toc\b[^"]*"[^>]*>[\s\S]*?<\/nav>/g,
      '',
    )
    .replace(/\s(?:srcset|sizes)="[^"]*"/g, '')
    .replace(
      /(\s(?:src|href|poster)=")\/(?!\/)/g,
      (_, attribute: string) => `${attribute}${origin}/`,
    );

/** A feed item as the `feed.items` filter sees it: presentation data, escaped afterwards. */
export interface FeedItem {
  id: string;
  title: string;
  link: string;
  description: string;
  publishedAt: string;
  author?: string;
}

/** A feed channel as the `feed.channel` filter sees it. */
export interface FeedChannel {
  title: string;
  link: string;
  description: string;
  language?: string;
}

/** What a feed shows besides its entries. */
export interface FeedOptions {
  /** The category, tag or author a narrowed feed follows. */
  title?: string;
  /** The feed's own path with its query (`/feed.xml?category=news`). */
  self?: string;
  /** Rendered bodies by entry id; omitted when feeds carry excerpts only. */
  bodies?: ReadonlyMap<string, FeedBody>;
  /** `feed.channel`/`feed.items` filter results; default to `feedValues`. */
  filtered?: { channel: FeedChannel; items: FeedItem[] };
}

/** The channel and items of the entry feed, before filters. */
export const feedValues = (
  site: Pick<PublicSiteDto, 'title' | 'description' | 'locale'>,
  settings: PublicSeoSettings,
  items: readonly PublicContentSummary[],
  title?: string,
) => ({
  channel: {
    title: title ? `${site.title} » ${title}` : site.title,
    link: absoluteUrl(settings.siteUrl, '/'),
    description: settings.homeDescription || site.description,
    language: site.locale,
  } satisfies FeedChannel,
  items: items.map((content): FeedItem => ({
    id: content.id,
    title: content.title,
    link: absoluteUrl(settings.siteUrl, content.path),
    description: content.seo.description || content.excerpt,
    publishedAt: content.publishedAt,
    ...(content.author && { author: content.author.name }),
  })),
});

const element = (name: string, value: string) =>
  `<${name}>${xmlText(value)}</${name}>`;

/** RFC 822 date of an item; left out when the (filtered) date does not parse. */
const pubDate = (value: string) => {
  const time = Date.parse(value);
  return Number.isNaN(time)
    ? []
    : [element('pubDate', new Date(time).toUTCString())];
};

/** RSS 2.0 of recent discoverable entries, linked to their canonical URLs. */
export const rssFeed = (
  site: PublicSiteDto,
  settings: PublicSeoSettings,
  items: readonly PublicContentSummary[],
  { title, self = FEED_PATH, bodies, filtered }: FeedOptions = {},
) => {
  const origin = settings.siteUrl;
  const { channel, items: values } =
    filtered ?? feedValues(site, settings, items, title);
  // Items keep their entry's terms and body by id; filters may reorder, drop or add items.
  const entriesById = new Map(items.map((content) => [content.id, content]));
  const entries = values.map((item) => {
    const content = entriesById.get(item.id);
    const body = bodies?.get(item.id);
    const audio = body?.audio;
    return [
      '    <item>',
      `      ${element('title', item.title)}`,
      `      ${element('link', item.link)}`,
      `      <guid isPermaLink="true">${xmlText(item.link)}</guid>`,
      ...pubDate(item.publishedAt).map((line) => `      ${line}`),
      ...(item.author ? [`      ${element('dc:creator', item.author)}`] : []),
      ...[...(content?.categories ?? []), ...(content?.tags ?? [])].map(
        (term) => `      ${element('category', term.name)}`,
      ),
      `      ${element('description', item.description)}`,
      ...(body?.html
        ? [
            `      ${element('content:encoded', absoluteBody(origin, body.html))}`,
          ]
        : []),
      ...(audio
        ? [
            `      <enclosure url="${xmlText(absoluteUrl(origin, audio.path))}" length="${audio.length}" type="${audio.type}"/>`,
          ]
        : []),
      '    </item>',
    ].join('\n');
  });
  return xmlResponse(
    [
      '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/">',
      '  <channel>',
      `    ${element('title', channel.title)}`,
      `    ${element('link', channel.link)}`,
      `    ${element('description', channel.description)}`,
      ...(channel.language
        ? [`    ${element('language', channel.language)}`]
        : []),
      `    <atom:link href="${xmlText(absoluteUrl(origin, self))}" rel="self" type="application/rss+xml"/>`,
      ...entries,
      '  </channel>',
      '</rss>',
    ].join('\n'),
    'application/rss+xml',
  );
};

/** RSS 2.0 of approved comments; values are the (filtered) `feed.channel`/`feed.items`. */
export const commentFeed = (channel: FeedChannel, items: readonly FeedItem[]) =>
  new Response(
    `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/"><channel>${element('title', channel.title)}${element('link', channel.link)}${element('description', channel.description)}${channel.language ? element('language', channel.language) : ''}${items
      .map(
        (item) =>
          `<item>${element('title', item.title)}${element('link', item.link)}<guid isPermaLink="true">${xmlText(item.link)}</guid>${item.author ? element('dc:creator', item.author) : ''}${element('description', item.description)}${pubDate(item.publishedAt).join('')}</item>`,
      )
      .join('')}</channel></rss>`,
    {
      headers: {
        'content-type': 'application/rss+xml; charset=utf-8',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
      },
    },
  );

/** Whether llms.txt (and its describedby link) is published at all. */
export const llmsEnabled = (settings: PublicSeoSettings) =>
  settings.indexingEnabled && settings.llmsTxtEnabled;

/**
 * llms.txt (llmstxt.org proposal): a short introduction, Markdown links to recent entries and
 * the sitemap for complete discovery. A reading aid for agents, not a ranking signal.
 */
export const llmsTxt = (
  site: PublicSiteDto,
  settings: PublicSeoSettings,
  items: readonly PublicContentSummary[],
  /** The `llms.txt` filter's result; defaults to the generated text. */
  text = llmsText(site, settings, items),
) => textResponse(text, 'text/plain');

export const llmsText = (
  site: PublicSiteDto,
  settings: PublicSeoSettings,
  items: readonly PublicContentSummary[],
) => {
  const origin = settings.siteUrl;
  const intro = markdownInline(
    settings.llmsIntro || settings.homeDescription || site.description,
  ).trim();
  // Encoded slugs hold nothing that could end a Markdown destination.
  const links = items.map((content) => {
    const url = absoluteUrl(origin, markdownPath(content.slug));
    const summary = markdownInline(
      content.seo.description || content.excerpt,
    ).trim();
    return `- [${markdownInline(content.title).trim()}](${url})${summary ? `: ${summary}` : ''}`;
  });
  const sitemap = absoluteUrl(origin, '/sitemap.xml');
  return `${[
    `# ${markdownInline(site.title).trim()}`,
    intro && `> ${intro}`,
    `## Recent\n\nThe ${RECENT_LIMIT} most recent entries at most, newest first, as Markdown.`,
    links.join('\n'),
    `## Complete index\n\n- [Sitemap](${sitemap}): every indexable page`,
  ]
    .filter(Boolean)
    .join('\n\n')}\n`;
};

/**
 * The Markdown alternate: never indexed itself (the HTML page is canonical) and linked back to
 * it. Entries that are not discoverable are answered with 404 by the route.
 */
export const markdownResponse = (
  content: PublicContent,
  settings: PublicSeoSettings,
  /** The `seo.markdown` filter's result; defaults to the rendered Markdown. */
  markdown = contentMarkdown(content, settings.siteUrl),
) => {
  const origin = settings.siteUrl;
  // Relative when no origin is configured: clients resolve it against the URL they requested.
  const links = [`<${absoluteUrl(origin, content.path)}>; rel="canonical"`];
  if (llmsEnabled(settings) && origin)
    links.push(
      `<${absoluteUrl(origin, '/llms.txt')}>; rel="describedby"; type="text/plain"`,
    );
  return new Response(markdown, {
    headers: {
      'content-type': 'text/markdown; charset=utf-8',
      'x-robots-tag': content.seo.noFollow ? 'noindex, nofollow' : 'noindex',
      link: links.join(', '),
      'cache-control': CACHE,
    },
  });
};
