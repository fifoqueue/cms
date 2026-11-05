import { dev } from '$app/env';
import type { Handle } from '@sveltejs/kit/hooks';
import { isCredentialLess } from '#lib/server/credential-less.js';
import { Errors } from '#lib/server/errors.js';

/** Methods an HTML form can submit with. */
const METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Content types an HTML form (or SvelteKit's binary form encoding) can post across sites. */
const FORM_TYPES = new Set([
  'application/x-www-form-urlencoded',
  'multipart/form-data',
  'text/plain',
  'application/x-sveltekit-formdata',
]);

/** No content type, or a form one (parameters and case ignored). */
const isForm = (request: Request) => {
  const type = request.headers.get('content-type');

  return !type || FORM_TYPES.has(type.split(';', 1)[0]!.trim().toLowerCase());
};

/**
 * The cross-site form check of the production server (none in development); the first handle,
 * so a refused request reaches no other hook. A POST, PUT, PATCH or DELETE with a form or missing
 * content type whose `Origin` is missing or not the request URL's origin gets 403: the message
 * as text, or `{ message }` when `Accept` is exactly `application/json`. Credential-less
 * endpoints (`#lib/server/credential-less.js`) are exempt. Remote function calls keep
 * SvelteKit's own same-origin check, which no setting relaxes.
 */
export const csrf: Handle = ({ event, resolve }) => {
  const { request } = event;

  if (
    dev ||
    event.isRemoteRequest ||
    !METHODS.has(request.method) ||
    !isForm(request) ||
    request.headers.get('origin') === event.url.origin ||
    isCredentialLess(event)
  )
    return resolve(event);

  return request.headers.get('accept') === 'application/json'
    ? Response.json({ message: Errors.CrossSiteForm }, { status: 403 })
    : new Response(Errors.CrossSiteForm, { status: 403 });
};
