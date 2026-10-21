import type { Cookies } from '@sveltejs/kit';
import { redirect } from '@sveltejs/kit';
import type { SessionGrant } from '@cms/sdk';
import { adminApi } from './api';

export const SESSION_COOKIE = 'cms_session';

export const startSession = (cookies: Cookies, grant: SessionGrant) =>
  cookies.set(SESSION_COOKIE, grant.token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    expires: new Date(grant.expiresAt),
  });

export const endSession = (cookies: Cookies) =>
  cookies.delete(SESSION_COOKIE, { path: '/' });

/** Admin API client for the signed-in user. `hooks.server.ts` guarantees the session on admin routes. */
export const adminFor = ({
  fetch,
  locals,
}: {
  fetch: typeof globalThis.fetch;
  locals: App.Locals;
}) => {
  if (!locals.token) redirect(303, '/admin/login');
  return adminApi(fetch, locals.token);
};
