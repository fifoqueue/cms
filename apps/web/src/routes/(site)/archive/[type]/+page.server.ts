import { error } from '@sveltejs/kit';
import { contentApi } from '#lib/server/api.js';
import { Errors } from '#lib/server/errors.js';
import { listView, pageParam } from '#lib/server/public-view.js';
import { loadSlots } from '#lib/server/slots.js';
import { withTemplateData } from '#lib/server/theme-queries.js';
import type { PageServerLoad } from './$types';

/** The list of a content type that publishes an archive. */
export const load: PageServerLoad = async ({ fetch, url, params, parent }) => {
  const api = contentApi(fetch);
  const slots = loadSlots(api, { path: url.pathname });
  const pageSize = (await parent()).reading.postsPerPage;
  const type = (await api.contentTypes()).find(
    (option) => option.key === params.type && option.archive,
  );
  if (!type) error(404, Errors.NotFound);
  const posts = await api.list({
    type: type.key,
    page: pageParam(url),
    pageSize,
  });
  return withTemplateData(api, parent, {
    kind: 'archive' as const,
    archive: {
      key: type.key,
      name: type.pluralName,
      description: type.description,
    },
    posts: listView(posts),
    slots: await slots,
  });
};
