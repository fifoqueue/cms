import { redirect } from '@sveltejs/kit';
import { authApi, contentApi } from '#lib/server/api.js';
import { endSession } from '#lib/server/session-cookie.js';
import { markSignedOut } from '#lib/server/session.js';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ fetch, locals, cookies }) => {
  const loginPath = await contentApi(fetch)
    .site()
    .then((site) => site.loginPath)
    .catch(() => '/login');
  await authApi(fetch, locals.token)
    .logout()
    .catch(() => undefined);
  endSession(cookies);
  // The sign-in page clears this tab's editor backups only after a completed sign-out.
  markSignedOut(cookies);
  redirect(303, loginPath);
};
