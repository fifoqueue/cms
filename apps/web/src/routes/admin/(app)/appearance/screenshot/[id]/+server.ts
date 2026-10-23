import { error } from '@sveltejs/kit';
import { can } from '@cms/sdk/capabilities';
import { apiUrl } from '#lib/server/api.js';
import { Errors } from '#lib/server/errors.js';
import type { RequestHandler } from './$types';

/** A theme's screenshot for the Themes screen, fetched from the API with the admin session. */
export const GET: RequestHandler = async ({ fetch, params, locals }) => {
  if (!locals.user || !locals.token || !can(locals.user, 'appearance.manage'))
    error(404, Errors.NotFound);
  const response = await fetch(
    `${apiUrl}/api/v1/admin/themes/${encodeURIComponent(params.id)}/screenshot`,
    { headers: { authorization: `Bearer ${locals.token}` } },
  );
  const type = response.headers.get('content-type');
  if (!response.ok || (type !== 'image/png' && type !== 'image/webp'))
    error(404, Errors.NotFound);
  return new Response(response.body, {
    headers: {
      'content-type': type,
      'x-content-type-options': 'nosniff',
      'cache-control': 'private, max-age=300',
    },
  });
};
