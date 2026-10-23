import { redirect } from '@sveltejs/kit';
import { authApi, contentApi } from '#lib/server/api.js';
import { failFrom, text } from '#lib/server/errors.js';
import { RETURN_PARAM, returnPath } from '#lib/server/return-path.js';
import { startSession } from '#lib/server/session.js';
import { rememberSsoTransaction, ssoApi } from '#lib/server/sso.js';
import { clientProof, visitorOf } from '#lib/server/visitor.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ fetch, locals, url }) => {
  if ((await authApi(fetch).status()).setupRequired)
    redirect(303, '/admin/setup');
  const back = returnPath(url.searchParams.get(RETURN_PARAM));
  if (locals.user) redirect(303, back);

  const [sso, captcha] = await Promise.all([
    ssoApi(fetch).info(),
    contentApi(fetch).captcha(),
  ]);
  return {
    sso,
    captcha,
    membership: await authApi(fetch).membership(),
    back,
  };
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
      );
    } catch (caught) {
      // The form posts to `?/login`, dropping the query: echo where to go after the next try.
      return failFrom(caught, {
        email,
        back: returnPath(text(form, RETURN_PARAM)),
      });
    }
    redirect(303, returnPath(text(form, RETURN_PARAM)));
  },
};
