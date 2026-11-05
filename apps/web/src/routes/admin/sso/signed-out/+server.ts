import { redirect } from '@sveltejs/kit';
import { loginPathOf } from '#lib/server/sign-in.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ fetch }) => {
  redirect(303, await loginPathOf(fetch, true));
};
