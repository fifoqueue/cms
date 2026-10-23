import { redirect } from '@sveltejs/kit';

/**
 * Redirects a list request past its last page (left over after Screen Options raised the page
 * size, or after deletions) to the last page, keeping every other filter.
 */
export const clampPage = (
  url: URL,
  list: { total: number; page: number; pageSize: number },
) => {
  const last = Math.max(1, Math.ceil(list.total / list.pageSize));
  if (list.page <= last) return;
  const params = new URLSearchParams(url.searchParams);
  if (last === 1) params.delete('page');
  else params.set('page', String(last));
  const query = params.toString();
  redirect(303, `${url.pathname}${query ? `?${query}` : ''}`);
};
