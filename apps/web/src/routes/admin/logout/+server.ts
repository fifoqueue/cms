import { redirect } from '@sveltejs/kit';
import { authApi } from '#lib/server/api.js';
import { endSession } from '#lib/server/session-cookie.js';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ fetch, locals, cookies }) => {
  await authApi(fetch, locals.token)
    .logout()
    .catch(() => undefined);
  endSession(cookies);
  redirect(303, '/admin/login');
};
