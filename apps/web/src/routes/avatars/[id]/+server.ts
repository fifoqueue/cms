import { avatarFiles } from '#lib/server/api.js';
import { relayFile } from '#lib/server/relay.js';
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
  return relayFile(response, PASSED);
};
