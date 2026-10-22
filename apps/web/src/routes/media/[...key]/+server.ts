import { mediaFiles } from '#lib/server/api.js';
import type { RequestHandler } from './$types';

/** Headers of the API's file response that the browser needs. */
const PASSED = [
  'content-type',
  'content-length',
  'content-range',
  'accept-ranges',
  'cache-control',
  'x-content-type-options',
  'content-security-policy',
];

/** Uploaded media, streamed from the API (the browser never talks to the API). */
export const GET: RequestHandler = async ({ fetch, params, request }) => {
  const response = await mediaFiles(fetch).file(
    params.key,
    request.headers.get('range'),
  );
  const headers = new Headers();
  for (const name of PASSED) {
    const value = response.headers.get(name);
    if (value) headers.set(name, value);
  }
  if (!response.ok && response.status !== 206)
    return new Response(null, { status: response.status === 404 ? 404 : 502 });
  return new Response(response.body, { status: response.status, headers });
};
