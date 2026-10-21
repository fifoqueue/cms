import { redirect } from '@sveltejs/kit';
import { failFrom } from '#lib/server/errors.js';
import { rememberSsoTransaction, ssoApi } from '#lib/server/sso.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ fetch, locals }) => {
  const sso = ssoApi(fetch, locals.token);
  const [info, status] = await Promise.all([sso.info(), sso.identity()]);

  return { sso: info, status };
};

export const actions: Actions = {
  /** Sends the signed-in user to the provider; the callback links the account they choose there. */
  link: async ({ fetch, locals, cookies }) => {
    let start;

    try {
      start = await ssoApi(fetch, locals.token).start({ intent: 'link' });
    } catch (caught) {
      return failFrom(caught);
    }

    rememberSsoTransaction(cookies, start);
    redirect(303, start.authorizationUrl);
  },

  unlink: async ({ fetch, locals }) => {
    try {
      await ssoApi(fetch, locals.token).unlink();
    } catch (caught) {
      return failFrom(caught);
    }

    return { notice: 'Single sign-on account unlinked' };
  },
};
