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
  const [markdown] = await filterDiscovery(event, [
    {
      kind: 'seo.markdown',
      value: contentMarkdown(content, settings.siteUrl),
    },
  ]);
  return markdownResponse(content, settings, markdown);
};
