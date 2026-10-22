import { authApi } from '#lib/server/api.js';
import { failFrom, text } from '#lib/server/errors.js';
import type { Actions, PageServerLoad } from './$types';

/** The token from the emailed link travels in the form, never in page data beyond this page. */
export const load: PageServerLoad = ({ url, setHeaders }) => {
  // The link holds a secret: keep it out of caches and referrers.
  setHeaders({ 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' });
  return { token: url.searchParams.get('token') ?? '' };
};

export const actions: Actions = {
  default: async ({ fetch, request }) => {
    const form = await request.formData();
    try {
      await authApi(fetch).password.reset({
        token: text(form, 'token'),
        password: text(form, 'password'),
      });
    } catch (caught) {
      return failFrom(caught);
    }
    return { done: true };
  },
};
