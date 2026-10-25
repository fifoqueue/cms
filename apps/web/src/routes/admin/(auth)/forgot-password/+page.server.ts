import { authApi, contentApi } from '#lib/server/api.js';
import { allowCaptcha } from '#lib/server/captcha.js';
import { failFrom, text } from '#lib/server/errors.js';
import { passwordAllowed } from '#lib/server/sign-in.js';
import { visitorOf } from '#lib/server/visitor.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  const [captcha, passwordReset] = await Promise.all([
    contentApi(event.fetch).captcha(),
    passwordAllowed(event.fetch),
  ]);
  return { captcha: allowCaptcha(event, captcha), passwordReset };
};

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
