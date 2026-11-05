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
import {
  MEDIA_PATH,
  SEO_ROBOTS_DISALLOW_PATHS,
  SEO_SITEMAP_PAGE_SIZE,
} from '@cms/sdk';
import type { ContentClient } from '@cms/sdk/client';
import { createHash } from 'node:crypto';
import { mapLimit } from '#lib/server/bounded.js';
import { Errors } from '#lib/server/errors.js';
import { contentMarkdown, markdownInline } from '#lib/server/markdown.js';
import { FEED_PATH, markdownPath } from '#lib/seo/paths.js';

/** sitemaps.org limit on sitemaps per index, including byte-split parts of API pages. */
export const SITEMAP_INDEX_LIMIT = 50_000;
const SITEMAP_MAX_BYTES = 50 * 1024 * 1024;
const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8"?>\n';
const encoder = new TextEncoder();

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
  ...SEO_ROBOTS_DISALLOW_PATHS.map((path) => `Disallow: ${path}`),
  'Allow: /preview/theme/',
];

/** Robots product tokens; user-triggered fetching follows the AI-search preference. */
export const AI_BOTS = {
  training: [
    'GPTBot',
    'ClaudeBot',
    'anthropic-ai',
    'CCBot',
    'Google-Extended',
    'Applebot-Extended',
    'Meta-ExternalAgent',
    'Bytespider',
    'cohere-ai',
    'Amazonbot',
    'AI2Bot',
    'Diffbot',
    'omgili',
    'omgilibot',
  ],
  search: [
    'OAI-SearchBot',
    'Claude-SearchBot',
    'PerplexityBot',
    'YouBot',
    'DuckAssistBot',
  ],
  fetch: [
    'ChatGPT-User',
    'Claude-User',
    'Perplexity-User',
    'Meta-ExternalFetcher',
  ],
} as const;

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
  !content.protected &&
  !content.seo.noIndex &&
  (!content.seo.canonicalUrl ||
    content.seo.canonicalUrl === absoluteUrl(settings.siteUrl, content.path));

/**
 * The newest discoverable entries, filtering before the final limit. Each type scans at
 * most twenty 100-entry batches, so locked/noindex entries cannot consume the first batch.
 */
export const loadRecent = async (
  api: ContentClient,
  settings: PublicSeoSettings,
  types?: readonly ContentType[],
  limit = RECENT_LIMIT,
  filter: PublicContentListQuery = {},
) => {
  const lists = await mapLimit(types ?? [undefined], async (type) => {
    const items: PublicContentSummary[] = [];

    for (let page = 1; page <= 20 && items.length < limit; page++) {
      const result = await api.list({
        orderby: 'date',
        order: 'desc',
        ...filter,
        type: type ?? filter.type,
        page,
        pageSize: 100,
      });

      items.push(
        ...result.items.filter((content) => isDiscoverable(content, settings)),
      );
      if (page * 100 >= result.total) break;
    }

    return items.slice(0, limit);
  });

  return lists
    .flat()
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

/** Only body ETags validate dynamic output; content dates are not monotonic representation versions. */
export const conditionalResponse = async (
  request: Request,
  response: Response,
  modified?: string,
) => {
  if (response.status !== 200) return response;
  const body = await response.text();
  const headers = new Headers(response.headers);
  const tag = `W/"${createHash('sha256').update(body).digest('hex')}"`;

  headers.set('etag', tag);
  const date = modified && isoDate(modified);

  if (date) headers.set('last-modified', new Date(date).toUTCString());
  const candidates = request.headers.get('if-none-match');
  const unchanged =
    candidates !== null &&
    candidates
      .split(',')
      .some(
        (candidate) =>
          candidate.trim() === '*' ||
          candidate.trim().replace(/^W\//, '') === tag.slice(2),
      );

  return new Response(unchanged ? null : body, {
    status: unchanged ? 304 : 200,
    headers,
  });
};

export const newestDate = (dates: readonly string[]) =>
  dates
    .map(isoDate)
    .filter((date): date is string => Boolean(date))
    .sort()
    .at(-1);

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
  textResponse(`${XML_DECLARATION}${body}\n`, type);

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

const extraRobotGroups = (text: string) => {
  const groups: string[] = [];
  let agents = ['User-agent: *'];
  let rules: string[] = [];
  let explicit = false;
  const flush = () => {
    groups.push([...agents, ...PRIVATE_RULES, ...rules].join('\n'));
    rules = [];
  };

  for (const line of text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)) {
    if (/^User-agent:/i.test(line)) {
      if (!explicit || rules.some((rule) => !rule.startsWith('#'))) {
        if (explicit || rules.length) flush();
        agents = [line];
      } else agents.push(line);
      explicit = true;
    } else rules.push(line);
  }

  if (explicit || rules.length) flush();

  return groups;
};

export const robotsText = (settings: PublicSeoSettings) => {
  const group = (agent: string, allowed: boolean) =>
    [
      `User-agent: ${agent}`,
      ...(allowed
        ? [...PRIVATE_RULES, 'Allow: /']
        : ['Disallow: /', 'Allow: /preview/theme/']),
    ].join('\n');
  const sections = [
    '# Crawl preferences for compliant crawlers; this file does not restrict access.',
    group('*', settings.indexingEnabled),
  ];
  const overrides = new Map(
    settings.aiBotOverrides
      .split(/\r?\n/)
      .filter((line) => line.trim())
      .map((line) => {
        const [agent, rule] = line.split(':');

        return [
          agent!.trim().toLowerCase(),
          {
            agent: agent!.trim(),
            allowed: rule!.trim().toLowerCase() === 'allow',
          },
        ] as const;
      }),
  );

  for (const [kind, agents] of Object.entries(AI_BOTS))
    for (const agent of agents) {
      const override = overrides.get(agent.toLowerCase());

      sections.push(
        group(
          agent,
          settings.indexingEnabled &&
            (override?.allowed ??
              (kind === 'training'
                ? settings.allowAiTraining
                : settings.allowAiSearch)),
        ),
      );
      overrides.delete(agent.toLowerCase());
    }

  for (const { agent, allowed } of overrides.values())
    sections.push(group(agent, settings.indexingEnabled && allowed));
  // An indexing-off policy cannot be weakened by administrator-supplied groups.
  if (settings.indexingEnabled && settings.extraRobotsRules.trim())
    sections.push(...extraRobotGroups(settings.extraRobotsRules));

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
  entries: readonly { path: string; updatedAt?: string }[],
) => {
  if (entries.length > SITEMAP_INDEX_LIMIT)
    throw new Error(Errors.SitemapIndexTooLarge, {
      cause: { limit: SITEMAP_INDEX_LIMIT },
    });
  const items = entries.map(
    ({ path, updatedAt }) =>
      `  <sitemap><loc>${xmlText(absoluteUrl(origin, path))}</loc>${updatedAt ? `<lastmod>${isoDate(updatedAt) ?? ''}</lastmod>` : ''}</sitemap>`,
  );
  const body = [
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...items,
    '</sitemapindex>',
  ].join('\n');

  if (
    encoder.encode(`${XML_DECLARATION}${body}\n`).byteLength > SITEMAP_MAX_BYTES
  )
    throw new Error(Errors.SitemapIndexTooLarge);

  return xmlResponse(body);
};

type SitemapUrl = Pick<
  SeoSitemapEntry,
  'path' | 'updatedAt' | 'images' | 'alternates'
>;
const SITEMAP_OPEN =
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1" xmlns:xhtml="http://www.w3.org/1999/xhtml">';
const SITEMAP_CLOSE = '</urlset>';
const SITEMAP_ENVELOPE_BYTES = encoder.encode(
  `${XML_DECLARATION}${SITEMAP_OPEN}\n${SITEMAP_CLOSE}\n`,
).byteLength;

const sitemapUrl = (
  origin: string,
  { path, updatedAt, images, alternates }: SitemapUrl,
) => {
  const lastmod = isoDate(updatedAt);

  return `  <url><loc>${xmlText(absoluteUrl(origin, path))}</loc>${
    lastmod ? `<lastmod>${lastmod}</lastmod>` : ''
  }${(images ?? []).map((image) => `<image:image><image:loc>${xmlText(image.url)}</image:loc>${image.title ? `<image:title>${xmlText(image.title)}</image:title>` : ''}${image.caption ? `<image:caption>${xmlText(image.caption)}</image:caption>` : ''}</image:image>`).join('')}${(alternates ?? []).map((alternate) => `<xhtml:link rel="alternate" hreflang="${xmlText(alternate.lang)}" href="${xmlText(alternate.url)}"/>`).join('')}</url>`;
};

/** Split an API page on exact UTF-8 XML bytes, preserving whole URL/image groups. */
export function* sitemapParts(
  origin: string,
  entries: readonly SitemapUrl[],
  includeHome: boolean,
  homeDate?: string,
  omitPath?: string | null,
) {
  let urls: string[] = [];
  let bytes = SITEMAP_ENVELOPE_BYTES;
  let updatedAt: string | undefined;
  const visible = entries.filter((entry) => entry.path !== omitPath);
  const locations = includeHome
    ? [{ path: '/', updatedAt: homeDate ?? '' }, ...visible]
    : visible;

  for (const entry of locations) {
    const url = sitemapUrl(origin, entry);
    const size = encoder.encode(`${url}\n`).byteLength;

    if (SITEMAP_ENVELOPE_BYTES + size > SITEMAP_MAX_BYTES)
      throw new Error(Errors.SitemapEntryTooLarge);

    if (
      urls.length &&
      (bytes + size > SITEMAP_MAX_BYTES || urls.length === 50_000)
    ) {
      yield {
        body: [SITEMAP_OPEN, ...urls, SITEMAP_CLOSE].join('\n'),
        updatedAt,
      };
      urls = [];
      bytes = SITEMAP_ENVELOPE_BYTES;
      updatedAt = undefined;
    }

    urls.push(url);
    bytes += size;
    const date = isoDate(entry.updatedAt);

    if (date && (!updatedAt || date > updatedAt)) updatedAt = date;
  }

  yield { body: [SITEMAP_OPEN, ...urls, SITEMAP_CLOSE].join('\n'), updatedAt };
}

/** Static homes have no inferred date; other homes use the newest discoverable entry. */
export const sitemapHomeDate = async (
  api: ContentClient,
  frontPage: 'posts' | 'page',
) =>
  frontPage === 'page'
    ? undefined
    : (
        await api.seo.sitemap({
          kind: 'content',
          pageSize: 1,
          sort: 'modified',
        })
      ).items[0]?.updatedAt;

/** Part one retains the existing URL; subsequent byte-bounded parts use `?part=N`. */
export const sitemapChunk = (
  origin: string,
  entries: readonly SitemapUrl[],
  includeHome: boolean,
  homeDate?: string,
  omitPath?: string | null,
  part = 1,
) => {
  let number = 0;

  for (const chunk of sitemapParts(
    origin,
    entries,
    includeHome,
    homeDate,
    omitPath,
  )) {
    if (++number !== part) continue;
    const response = xmlResponse(chunk.body);

    if (chunk.updatedAt)
      response.headers.set(
        'last-modified',
        new Date(chunk.updatedAt).toUTCString(),
      );

    return response;
  }

  return notFound();
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
        const html = await api.resolvePath(item.path, undefined, 'feed').then(
          ({ content }) => (content && !content.protected ? content.html : ''),
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
  updatedAt?: string;
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
    updatedAt: content.updatedAt,
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
      `      <guid isPermaLink="false">urn:uuid:${xmlText(item.id)}</guid>`,
      ...pubDate(item.publishedAt).map((line) => `      ${line}`),
      ...(item.updatedAt && isoDate(item.updatedAt)
        ? [`      ${element('atom:updated', isoDate(item.updatedAt)!)}`]
        : []),
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
      ...(settings.webSubHub && self === FEED_PATH
        ? [`    <atom:link href="${xmlText(settings.webSubHub)}" rel="hub"/>`]
        : []),
      ...(newestDate(values.map((item) => item.updatedAt || item.publishedAt))
        ? [
            element(
              'lastBuildDate',
              new Date(
                newestDate(
                  values.map((item) => item.updatedAt || item.publishedAt),
                )!,
              ).toUTCString(),
            ),
          ]
        : []),
      ...entries,
      '  </channel>',
      '</rss>',
    ].join('\n'),
    'application/rss+xml',
  );
};

/** RSS 2.0 of approved comments; values are the (filtered) `feed.channel`/`feed.items`. */
export const commentFeed = (
  channel: FeedChannel,
  items: readonly FeedItem[],
  self = `${channel.link.replace(/\/$/, '')}/comments/feed.xml`,
) =>
  new Response(
    `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/"><channel>${element('title', channel.title)}${element('link', channel.link)}${element('description', channel.description)}${channel.language ? element('language', channel.language) : ''}<atom:link rel="self" type="application/rss+xml" href="${xmlText(self)}"/>${items
      .map(
        (item) =>
          `<item>${element('title', item.title)}${element('link', item.link)}<guid isPermaLink="false">urn:uuid:${xmlText(item.id)}</guid>${item.author ? element('dc:creator', item.author) : ''}${element('description', item.description)}${pubDate(item.publishedAt).join('')}</item>`,
      )
      .join('')}</channel></rss>`,
    {
      headers: {
        'content-type': 'application/rss+xml; charset=utf-8',
        'cache-control': 'public, max-age=60',
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
  topics: readonly Pick<
    SeoSitemapEntry,
    'path' | 'title' | 'description'
  >[] = [],
) => {
  const origin = settings.siteUrl;
  const intro = markdownInline(
    settings.llmsIntro ||
      settings.homeDescription ||
      site.description ||
      site.title,
  ).trim();
  // Encoded slugs hold nothing that could end a Markdown destination.
  const link = (content: PublicContentSummary) => {
    const url = absoluteUrl(origin, markdownPath(content.slug));
    const summary = markdownInline(
      content.seo.description || content.excerpt,
    ).trim();

    return `- [${markdownInline(content.title).trim()}](${url})${summary ? `: ${summary}` : ''}`;
  };
  const sitemap = absoluteUrl(origin, '/sitemap.xml');

  return `${[
    `# ${markdownInline(site.title).trim()}`,
    intro && `> ${intro}`,
    `## Pages\n\n${items
      .filter((item) => item.type === 'page')
      .map(link)
      .join('\n')}`,
    `## Recent posts\n\n${items
      .filter((item) => item.type !== 'page')
      .map(link)
      .join('\n')}`,
    `## Topics\n\n${topics.map((topic) => `- [${markdownInline(topic.title)}](${absoluteUrl(origin, topic.path)}): ${markdownInline(topic.description)}`).join('\n')}`,
    `## Optional\n\n- [Sitemap](${sitemap}): every indexable page\n- [Full text](${origin}/llms-full.txt): bounded Markdown collection${settings.feedsEnabled ? `\n- [RSS feed](${origin}/feed.xml): recent entries` : ''}`,
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
