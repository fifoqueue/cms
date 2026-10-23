import { redirect } from '@sveltejs/kit';
import { CONTENT_SLUG } from '@cms/sdk';
import { contentApi } from '#lib/server/api.js';
import { notFoundFrom } from '#lib/server/errors.js';
import {
  isDiscoverable,
  markdownResponse,
  notFound,
} from '#lib/server/seo-discovery.js';
import { markdownPath } from '#lib/seo/paths.js';
import type { RequestHandler } from './$types';

/**
 * `/<slug>.md`: the Markdown alternate of a published entry. Slugs are stable identifiers, so
 * this URL survives permalink changes; the canonical link names the HTML page. Entries that
 * are noindex, canonicalised elsewhere or hidden by global indexing return 404.
 */
export const GET: RequestHandler = async ({ fetch, params, url }) => {
  if (!CONTENT_SLUG.test(params.slug)) return notFound();
  const api = contentApi(fetch);
  const [settings, content] = await Promise.all([
    api.seo.settings(),
    api.getBySlug(params.slug).catch(notFoundFrom),
  ]);
  // A protected body is never published as Markdown.
  if (!isDiscoverable(content, settings) || content.protected)
    return notFound();
  const canonicalPath = markdownPath(content.slug);
  if (url.pathname !== canonicalPath)
    redirect(308, `${canonicalPath}${url.search}`);
  return markdownResponse(content, settings);
};
