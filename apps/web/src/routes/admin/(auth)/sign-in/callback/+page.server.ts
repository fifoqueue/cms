import { signInCallback } from '#lib/server/sign-in-callback.js';
import type { PageServerLoad } from './$types';

/** Where redirect-based sign-in methods send the browser back (register it at the provider). */
export const load: PageServerLoad = (event) => signInCallback(event);
