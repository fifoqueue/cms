import { redirect } from '@sveltejs/kit';
import { authApi, contentApi } from '#lib/server/api.js';
import { failFrom, text } from '#lib/server/errors.js';
import { startSession } from '#lib/server/session-cookie.js';
import { rememberSsoTransaction, ssoApi } from '#lib/server/sso.js';
import { clientProof, visitorOf } from '#lib/server/visitor.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ fetch, locals }) => {
  if ((await authApi(fetch).status()).setupRequired)
    redirect(303, '/admin/setup');
  if (locals.user) redirect(303, '/admin');

  const [sso, captcha] = await Promise.all([
    ssoApi(fetch).info(),
    contentApi(fetch).captcha(),
  ]);
  return { sso, captcha, membership: await authApi(fetch).membership() };
};

export const actions: Actions = {
  /** Sends the browser to the identity provider; the form is not enhanced so it navigates away. */
  sso: async ({ fetch, cookies, getClientAddress }) => {
    let start;

    try {
      start = await ssoApi(fetch).start(
        { intent: 'login' },
        clientProof(getClientAddress()),
      );
    } catch (caught) {
      return failFrom(caught);
    }

    rememberSsoTransaction(cookies, start);
    redirect(303, start.authorizationUrl);
  },

  login: async (event) => {
    const form = await event.request.formData();
    const email = text(form, 'email');
    try {
      startSession(
        event.cookies,
        await authApi(event.fetch).login(
          { email, password: text(form, 'password') },
          visitorOf(event, form),
        ),
        event.url,
      );
    } catch (caught) {
      return failFrom(caught, { email });
    }
    redirect(303, '/admin');
  },
};
