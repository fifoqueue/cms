// Crawler and agent discovery: robots.txt, sitemaps, the RSS feed, llms.txt and Markdown
// alternates. One policy decides what is discoverable, so every endpoint agrees with the API's
// sitemap selection: global indexing on, entry not noindex, no canonical pointing elsewhere.
// Absolute URLs use the configured site origin only, never the request Host header.
import type {
  ContentType,
  PublicContent,
  PublicContentSummary,
  PublicSeoSettings,
  PublicSiteDto,
  SeoSitemapEntry,
} from '@cms/sdk';
import { SEO_SITEMAP_PAGE_SIZE } from '@cms/sdk';
import type { ContentClient } from '@cms/sdk/client';
import { Errors } from '#lib/server/errors.js';
import { contentMarkdown, markdownInline } from '#lib/server/markdown.js';
import { markdownPath } from '#lib/seo/paths.js';

export const SITEMAP_KINDS = ['content', 'category', 'tag'] as const;
export type SitemapKind = (typeof SITEMAP_KINDS)[number];

/** sitemaps.org limit on sitemaps per index; each chunk holds one API page (≤ 1,000 URLs). */
const SITEMAP_INDEX_LIMIT = 50_000;

/** Entries listed by the feed and llms.txt: a recent selection, not the full corpus. */
export const RECENT_LIMIT = 20;
/** Content types syndicated in the feed; pages are not part of it. */
export const FEED_TYPES: readonly ContentType[] = ['post', 'article'];

/** Never crawled. Each permitted group repeats these, since a named group replaces `*`. */
const PRIVATE_RULES = [
  'Disallow: /admin$',
  'Disallow: /admin/',
  'Disallow: /api/',
];

export const isSitemapKind = (value: string): value is SitemapKind =>
  (SITEMAP_KINDS as readonly string[]).includes(value);

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
) => {
  const lists = await Promise.all(
    (types ?? [undefined]).map((type) => api.list({ type, pageSize: limit })),
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
export const robotsTxt = (settings: PublicSeoSettings) => {
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
  return textResponse(`${sections.join('\n\n')}\n`, 'text/plain');
};

/** Chunks of `kind`; the content sitemap always exists, since it also lists the home page. */
export const sitemapChunkCount = (kind: SitemapKind, total: number) =>
  Math.max(
    kind === 'content' ? 1 : 0,
    Math.ceil(total / SEO_SITEMAP_PAGE_SIZE),
  );

/** Sitemap index over every chunk of every kind; fails rather than truncating. */
export const sitemapIndex = (
  origin: string,
  totals: Record<SitemapKind, number>,
) => {
  const counts = SITEMAP_KINDS.map((kind) =>
    sitemapChunkCount(kind, totals[kind]),
  );
  // Checked before any list is allocated; a non-numeric count fails the same way.
  if (!(counts.reduce((sum, count) => sum + count, 0) <= SITEMAP_INDEX_LIMIT))
    throw new Error(Errors.SitemapIndexTooLarge(SITEMAP_INDEX_LIMIT));
  const chunks = SITEMAP_KINDS.flatMap((kind, index) =>
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

/** RSS 2.0 of recent discoverable posts and articles, linked to their canonical URLs. */
export const rssFeed = (
  site: PublicSiteDto,
  settings: PublicSeoSettings,
  items: readonly PublicContentSummary[],
) => {
  const origin = settings.siteUrl;
  const element = (name: string, value: string) =>
    `<${name}>${xmlText(value)}</${name}>`;
  const entries = items.map((content) => {
    const link = absoluteUrl(origin, content.path);
    return [
      '    <item>',
      `      ${element('title', content.title)}`,
      `      ${element('link', link)}`,
      `      <guid isPermaLink="true">${xmlText(link)}</guid>`,
      `      ${element('pubDate', new Date(content.publishedAt).toUTCString())}`,
      `      ${element('description', content.seo.description || content.excerpt)}`,
      '    </item>',
    ].join('\n');
  });
  return xmlResponse(
    [
      '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
      '  <channel>',
      `    ${element('title', site.title)}`,
      `    ${element('link', absoluteUrl(origin, '/'))}`,
      `    ${element('description', settings.homeDescription || site.description)}`,
      `    ${element('language', site.locale)}`,
      `    <atom:link href="${xmlText(absoluteUrl(origin, '/feed.xml'))}" rel="self" type="application/rss+xml"/>`,
      ...entries,
      '  </channel>',
      '</rss>',
    ].join('\n'),
    'application/rss+xml',
  );
};

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
  return textResponse(
    `${[
      `# ${markdownInline(site.title).trim()}`,
      intro && `> ${intro}`,
      `## Recent\n\nThe ${RECENT_LIMIT} most recent entries at most, newest first, as Markdown.`,
      links.join('\n'),
      `## Complete index\n\n- [Sitemap](${sitemap}): every indexable page`,
    ]
      .filter(Boolean)
      .join('\n\n')}\n`,
    'text/plain',
  );
};

/**
 * The Markdown alternate: never indexed itself (the HTML page is canonical) and linked back to
 * it. Entries that are not discoverable are answered with 404 by the route.
 */
export const markdownResponse = (
  content: PublicContent,
  settings: PublicSeoSettings,
) => {
  const origin = settings.siteUrl;
  // Relative when no origin is configured: clients resolve it against the URL they requested.
  const links = [`<${absoluteUrl(origin, content.path)}>; rel="canonical"`];
  if (llmsEnabled(settings) && origin)
    links.push(
      `<${absoluteUrl(origin, '/llms.txt')}>; rel="describedby"; type="text/plain"`,
    );
  return new Response(contentMarkdown(content, origin), {
    headers: {
      'content-type': 'text/markdown; charset=utf-8',
      'x-robots-tag': content.seo.noFollow ? 'noindex, nofollow' : 'noindex',
      link: links.join(', '),
      'cache-control': CACHE,
    },
  });
};
