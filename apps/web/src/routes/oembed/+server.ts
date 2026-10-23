import { contentApi } from '#lib/server/api.js';
import { messagesFor } from '#lib/i18n/index.js';
import { absoluteUrl, notFound, xmlText } from '#lib/server/seo-discovery.js';
import type { RequestHandler } from './$types';

/** Widths a consumer may ask for (`maxwidth`); the card is text, so height follows width. */
const width = (requested: string | null) =>
  Math.min(Math.max(Math.trunc(Number(requested)) || 600, 200), 1200);

/**
 * oEmbed provider (oembed.com), as WordPress sites offer: `?url=<entry address>&format=json`
 * answers with a `rich` card of plain links and text (no iframe or script). Only published
 * entries on this site's configured address that are not password-protected are described.
 */
export const GET: RequestHandler = async ({ fetch, url }) => {
  if ((url.searchParams.get('format') ?? 'json') !== 'json')
    return new Response(null, { status: 501 });
  const api = contentApi(fetch);
  const [settings, site] = await Promise.all([api.seo.settings(), api.site()]);
  let target: URL;
  try {
    target = new URL(url.searchParams.get('url') ?? '');
  } catch {
    return notFound();
  }
  if (!settings.siteUrl || target.origin !== new URL(settings.siteUrl).origin)
    return notFound();
  const resolved = await api.resolvePath(target.pathname).catch(() => null);
  const content = resolved?.content;
  if (!content || content.protected) return notFound();

  const link = absoluteUrl(settings.siteUrl, content.path);
  const home = absoluteUrl(settings.siteUrl, '/');
  const summary = content.seo.description || content.excerpt;
  const cardWidth = width(url.searchParams.get('maxwidth'));
  // `xmlText` escapes markup and drops characters HTML cannot carry either.
  const html = [
    '<blockquote class="cms-oembed">',
    `<p><a href="${xmlText(link)}">${xmlText(content.title)}</a></p>`,
    summary ? `<p>${xmlText(summary)}</p>` : '',
    `<p><a href="${xmlText(home)}">${xmlText(messagesFor(site.locale).oembedEmbedded(site.title))}</a></p>`,
    '</blockquote>',
  ].join('');
  return Response.json(
    {
      version: '1.0',
      type: 'rich',
      provider_name: site.title,
      provider_url: home,
      title: content.title,
      ...(content.author && {
        author_name: content.author.name,
        author_url: absoluteUrl(
          settings.siteUrl,
          `/author/${encodeURIComponent(content.author.slug)}`,
        ),
      }),
      ...(content.featuredImage && {
        thumbnail_url: absoluteUrl(settings.siteUrl, content.featuredImage.url),
        ...(content.featuredImage.width && {
          thumbnail_width: content.featuredImage.width,
          thumbnail_height: content.featuredImage.height,
        }),
      }),
      html,
      width: cardWidth,
      height: Math.round(cardWidth / 3),
    },
    {
      headers: {
        'cache-control': 'public, max-age=300',
        'access-control-allow-origin': '*',
      },
    },
  );
};
