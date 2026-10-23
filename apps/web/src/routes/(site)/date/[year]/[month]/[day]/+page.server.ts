import { error } from '@sveltejs/kit';
import { contentApi } from '#lib/server/api.js';
import { Errors } from '#lib/server/errors.js';
import { listView, pageParam, requirePage } from '#lib/server/public-view.js';
import { loadSlots } from '#lib/server/slots.js';
import type { PageServerLoad } from './$types';
export const load: PageServerLoad = async ({ fetch, params, url, parent }) => {
  const year = Number(params.year),
    month = Number(params.month),
    day = Number(params.day);
  if (
    !/^\d{4}$/.test(params.year) ||
    !/^(0[1-9]|1[0-2])$/.test(params.month) ||
    !/^(0[1-9]|[12]\d|3[01])$/.test(params.day) ||
    year < 1970 ||
    new Date(Date.UTC(year, month - 1, day)).getUTCDate() !== day
  )
    error(404, Errors.NotFound);
  const api = contentApi(fetch);
  const posts = await api.list({
    type: 'post',
    year,
    month,
    day,
    page: pageParam(url),
    pageSize: (await parent()).reading.postsPerPage,
  });
  requirePage(posts);
  return {
    kind: 'date' as const,
    date: { year, month, day },
    posts: listView(posts),
    slots: await loadSlots(api, { path: url.pathname }),
  };
};
