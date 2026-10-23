import type { Cookies } from '@sveltejs/kit';
import { error } from '@sveltejs/kit';
import { can } from '@cms/sdk';
import type { Capability } from '@cms/sdk';
import { adminApi } from '#lib/server/api.js';
import { Errors } from '#lib/server/errors.js';

/**
 * Set by the sign-out endpoint for the next sign-in page view, which then clears the tab's
 * editor backups. A server-set, short-lived cookie: a crafted link cannot trigger the cleanup.
 */
const SIGNED_OUT_COOKIE = 'cms_signed_out';
const SIGNED_OUT_PATH = '/';

export const markSignedOut = (cookies: Cookies) =>
  cookies.set(SIGNED_OUT_COOKIE, '1', {
    path: SIGNED_OUT_PATH,
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 60,
  });

/** Whether this view follows a completed sign-out; the marker is used up. */
export const takeSignedOut = (cookies: Cookies) => {
  const signedOut = cookies.get(SIGNED_OUT_COOKIE) === '1';
  if (signedOut) cookies.delete(SIGNED_OUT_COOKIE, { path: SIGNED_OUT_PATH });
  return signedOut;
};
/** Admin API client for the signed-in user. `hooks.server.ts` guarantees the session on admin routes. */
export const adminFor = ({
  fetch,
  locals,
}: {
  fetch: typeof globalThis.fetch;
  locals: App.Locals;
}) => {
  if (!locals.token) error(404, Errors.NotFound);
  return adminApi(fetch, locals.token);
};

/** 403 unless the signed-in user's role grants `capability`. The API enforces it again. */
export const requireCapability = (
  locals: App.Locals,
  capability: Capability,
) => {
  if (!locals.user || !can(locals.user, capability))
    error(403, Errors.Forbidden);
};
