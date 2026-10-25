import { signInCallback } from '#lib/server/sign-in-callback.js';
import type { PageServerLoad } from './$types';

/**
 * The single sign-on redirect URI registered at identity providers; the same callback as
 * `/admin/sign-in/callback`.
 */
export const load: PageServerLoad = (event) => signInCallback(event);
