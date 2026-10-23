import { redirect } from '@sveltejs/kit';
import { authApi } from '#lib/server/api.js';
import { endSession } from '#lib/server/session.js';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ fetch, locals, cookies }) => {
  await authApi(fetch, locals.token)
    .logout()
    .catch(() => undefined);
  endSession(cookies);
  // The sign-in page clears this tab's editor backups only after a completed sign-out.
  redirect(303, '/admin/login?signedOut');
};
