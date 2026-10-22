import { authApi, contentApi } from '#lib/server/api.js';
import { failFrom, text } from '#lib/server/errors.js';
import { visitorOf } from '#lib/server/visitor.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ fetch }) => ({
  captcha: await contentApi(fetch).captcha(),
});

export const actions: Actions = {
  default: async (event) => {
    const form = await event.request.formData();
    const email = text(form, 'email');
    try {
      await authApi(event.fetch).password.forgot(email, visitorOf(event, form));
    } catch (caught) {
      return failFrom(caught, { email });
    }
    return { sent: true };
  },
};
