import { error } from '@sveltejs/kit';
import { contentApi } from '#lib/server/api.js';
import { Errors } from '#lib/server/errors.js';
import { listView, pageParam } from '#lib/server/public-view.js';
import { loadSlots } from '#lib/server/slots.js';
import type { PageServerLoad } from './$types';

/** Posts published in a UTC year (`/date/2026`) or month (`/date/2026/03`). */
export const load: PageServerLoad = async ({ fetch, url, params, parent }) => {
  const year = /^\d{4}$/.test(params.year) ? Number(params.year) : NaN;
  const month =
    params.month === undefined
      ? null
      : /^(0[1-9]|1[0-2])$/.test(params.month)
        ? Number(params.month)
        : NaN;
  if (!(year >= 1970) || Number.isNaN(month)) error(404, Errors.NotFound);
  const api = contentApi(fetch);
  const slots = loadSlots(api, { path: url.pathname });
  const posts = await api.list({
    type: 'post',
    year,
    month: month ?? undefined,
    page: pageParam(url),
    pageSize: (await parent()).reading.postsPerPage,
  });
  return {
    kind: 'date' as const,
    date: { year, month },
    posts: listView(posts),
    slots: await slots,
  };
};
