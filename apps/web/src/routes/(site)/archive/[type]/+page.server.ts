import { error } from '@sveltejs/kit';
import { contentApi } from '#lib/server/api.js';
import { listPosts } from '#lib/server/archive.js';
import { Errors } from '#lib/server/errors.js';
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
  const posts = await listPosts(api, url, { type: type.key }, pageSize);
  return withTemplateData(api, parent, {
    kind: 'archive' as const,
    archive: {
      key: type.key,
      name: type.pluralName,
      description: type.description,
    },
    posts,
    slots: await slots,
  });
};
