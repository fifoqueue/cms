import { redirect } from '@sveltejs/kit';
import { authApi } from '#lib/server/api.js';
import { failFrom, text } from '#lib/server/errors.js';
import { startSession } from '#lib/server/session.js';
import {
  rememberSsoTransaction,
  ssoApi,
  ssoClientProof,
} from '#lib/server/sso.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ fetch, locals }) => {
  if ((await authApi(fetch).status()).setupRequired)
    redirect(303, '/admin/setup');
  if (locals.user) redirect(303, '/admin');

  return { sso: await ssoApi(fetch).info() };
};

export const actions: Actions = {
  /** Sends the browser to the identity provider; the form is not enhanced so it navigates away. */
  sso: async ({ fetch, cookies, getClientAddress }) => {
    let start;

    try {
      start = await ssoApi(fetch).start(
        { intent: 'login' },
        ssoClientProof(getClientAddress()),
      );
    } catch (caught) {
      return failFrom(caught);
    }

    rememberSsoTransaction(cookies, start);
    redirect(303, start.authorizationUrl);
  },

  login: async ({ request, fetch, cookies }) => {
    const form = await request.formData();
    try {
      startSession(
        cookies,
        await authApi(fetch).login({
          email: text(form, 'email'),
          password: text(form, 'password'),
        }),
      );
    } catch (caught) {
      return failFrom(caught);
    }
    redirect(303, '/admin');
  },
};
