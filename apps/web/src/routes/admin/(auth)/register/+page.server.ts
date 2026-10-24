import { authApi, contentApi } from '#lib/server/api.js';
import { failFrom, text } from '#lib/server/errors.js';
import { visitorOf } from '#lib/server/visitor.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ fetch }) => ({
  captcha: await contentApi(fetch).captcha(),
  membership: await authApi(fetch).membership(),
});

export const actions: Actions = {
  default: async (event) => {
    const form = await event.request.formData();
    const email = text(form, 'email');
    const name = text(form, 'name');
    try {
      await authApi(event.fetch).register(
        { email, name },
        visitorOf(event, form),
      );
    } catch (caught) {
      return failFrom(caught, { email, name });
    }
    return { sent: true };
  },
};
