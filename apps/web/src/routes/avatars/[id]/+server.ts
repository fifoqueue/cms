import { avatarFiles } from '#lib/server/api.js';
import type { RequestHandler } from './$types';

const PASSED = [
  'content-type',
  'content-length',
  'cache-control',
  'x-content-type-options',
  'content-security-policy',
];

/** Public avatars stay same-origin; only bounded image bytes pass through from the API. */
export const GET: RequestHandler = async ({ fetch, params, url }) => {
  const response = await avatarFiles(fetch).file(
    params.id,
    url.searchParams.get('s'),
  );
  const headers = new Headers();
  for (const name of PASSED) {
    const value = response.headers.get(name);
    if (value) headers.set(name, value);
  }
  if (!response.ok)
    return new Response(null, { status: response.status === 404 ? 404 : 502 });
  return new Response(response.body, { headers });
};
