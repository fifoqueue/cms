import { contentApi } from '#lib/server/api.js';
import { notFoundFrom } from '#lib/server/errors.js';
import { listView, pageParam } from '#lib/server/public-view.js';
import { loadSlots } from '#lib/server/slots.js';
import { withTemplateData } from '#lib/server/theme-queries.js';
import type { PageServerLoad } from './$types';

/** Everything an author published. Users without published entries have no archive. */
export const load: PageServerLoad = async ({ fetch, url, params, parent }) => {
  const api = contentApi(fetch);
  const slots = loadSlots(api, { path: url.pathname });
  const posts = api.list({
    author: params.slug,
    page: pageParam(url),
    pageSize: (await parent()).reading.postsPerPage,
  });
  posts.catch(() => undefined);
  const author = await api.author(params.slug).catch(notFoundFrom);
  return withTemplateData(api, parent, {
    kind: 'author' as const,
    author: { name: author.name, slug: author.slug, bio: author.bio },
    posts: listView(await posts),
    slots: await slots,
  });
};
