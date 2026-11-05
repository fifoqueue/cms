import { redirect } from '@sveltejs/kit';
import { CONTENT_SLUG } from '@cms/sdk';
import { contentApi } from '#lib/server/api.js';
import { notFoundFrom } from '#lib/server/errors.js';
import {
  conditionalResponse,
  markdownResponse,
  notFound,
} from '#lib/server/seo-discovery.js';
import { markdownDiscoverable, markdownPath } from '#lib/seo/paths.js';
import { contentMarkdown } from '#lib/server/markdown.js';
import { filterDiscovery } from '#lib/server/seo-filter.js';
import type { RequestHandler } from './$types';

/**
 * `/<slug>.md`: the Markdown alternate of a published entry. Slugs are stable identifiers, so
 * this URL survives permalink changes; the canonical link names the HTML page. Entries that
 * are noindex, canonicalised elsewhere or hidden by global indexing return 404.
 */
export const GET: RequestHandler = async (event) => {
  const { params, url } = event;

  if (!CONTENT_SLUG.test(params.slug)) return notFound();
  const api = contentApi(event.fetch);
  const [settings, stored, site, reading] = await Promise.all([
    api.seo.settings(),
    api.getBySlug(params.slug).catch(notFoundFrom),
    api.site(),
    api.reading(),
  ]);
  const content = {
    ...stored,
    path: stored.path === reading.frontPagePath ? '/' : stored.path,
  };

  // A protected body is never published as Markdown.
  if (
    !markdownDiscoverable(content, settings.siteUrl, settings.indexingEnabled)
  )
    return notFound();
  const canonicalPath = markdownPath(content.slug);

  if (url.pathname !== canonicalPath)
    redirect(308, `${canonicalPath}${url.search}`);
  const [markdown] = await filterDiscovery(event, [
    {
      kind: 'seo.markdown',
      value: contentMarkdown(content, settings.siteUrl, site.locale),
      context: {
        id: content.id,
        slug: content.slug,
        path: content.path,
        type: content.type,
      },
    },
  ]);

  return conditionalResponse(
    event.request,
    markdownResponse(content, settings, markdown),
    content.updatedAt,
  );
};
