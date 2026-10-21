import { contentApi } from '#lib/server/api.js';
import type { PageServerLoad } from './$types';

const PAGE_SIZE = 10;

export const load: PageServerLoad = async ({ fetch, url }) => {
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
  return {
    posts: await contentApi(fetch).list({
      type: 'post',
      page,
      pageSize: PAGE_SIZE,
    }),
  };
};
