import { redirect } from '@sveltejs/kit';
import { contentApi } from '#lib/server/api.js';
import { notFoundFrom } from '#lib/server/errors.js';
import { listingPath } from '#lib/seo/paths.js';
import { listPosts } from '#lib/server/archive.js';
import { loadSlots } from '#lib/server/slots.js';
import { withTemplateData } from '#lib/server/theme-queries.js';
import type { PageServerLoad } from './$types';

/** Everything an author published. Users without published entries have no archive. */
export const load: PageServerLoad = async ({ fetch, url, params, parent }) => {
  const api = contentApi(fetch);
  const slots = loadSlots(api, { path: url.pathname });
  const posts = listPosts(
    api,
    url,
    { author: params.slug },
    (await parent()).reading.postsPerPage,
  );
  posts.catch(() => undefined);
  const author = await api.author(params.slug).catch(notFoundFrom);
  const listed = await posts;
  const canonicalPath = listingPath({ kind: 'author', slug: author.slug });
  if (url.pathname !== canonicalPath)
    redirect(308, `${canonicalPath}${url.search}`);
  return withTemplateData(api, parent, {
    kind: 'author' as const,
    author: { name: author.name, slug: author.slug, bio: author.bio },
    posts: listed,
    slots: await slots,
  });
};
