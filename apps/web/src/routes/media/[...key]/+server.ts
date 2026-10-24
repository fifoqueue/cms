import { mediaFiles } from '#lib/server/api.js';
import { relayFile } from '#lib/server/relay.js';
import type { RequestHandler } from './$types';

/** Headers of the API's file response that the browser needs. */
const PASSED = [
  'content-type',
  'content-disposition',
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
  // Partial content (206) keeps its status.
  return relayFile(response, PASSED, response.status);
};
