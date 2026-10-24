import { passwordResetSchema, passwordSchema } from '@cms/sdk';
import { authApi } from '#lib/server/api.js';
import { failFrom, text } from '#lib/server/errors.js';
import type { Actions, PageServerLoad } from './$types';

/**
 * Reset and invitation links land here. The token from the emailed link travels in the form,
 * never in page data beyond this page; a malformed one asks for a new link instead of a form.
 */
export const load: PageServerLoad = ({ url, setHeaders }) => {
  // The link holds a secret: keep it out of caches and referrers.
  setHeaders({ 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' });
  const token = url.searchParams.get('token') ?? '';
  return {
    token,
    linkValid: passwordResetSchema.shape.token.safeParse(token).success,
    minLength: passwordSchema.minLength ?? 1,
    maxLength: passwordSchema.maxLength ?? undefined,
  };
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
