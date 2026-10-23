import { redirect } from '@sveltejs/kit';
import { authApi, contentApi } from '#lib/server/api.js';
import { endSession, markSignedOut } from '#lib/server/session-cookie.js';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ fetch, locals, cookies, url }) => {
  const loginPath = await contentApi(fetch)
    .site()
    .then((site) => site.loginPath)
    .catch(() => '/login');
  await authApi(fetch, locals.token)
    .logout()
    .catch(() => undefined);
  endSession(cookies);
  // The sign-in page clears this tab's editor backups only after a completed sign-out.
  markSignedOut(cookies, url);
  redirect(303, loginPath);
};
