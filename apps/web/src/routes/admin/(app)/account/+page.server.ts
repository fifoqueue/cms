import { redirect } from '@sveltejs/kit';
import { ADMIN_LOCALES } from '@cms/sdk';
import type { AdminLocale } from '@cms/sdk';
import { authApi } from '#lib/server/api.js';
import { failFrom, text } from '#lib/server/errors.js';
import { rememberSsoTransaction, ssoApi } from '#lib/server/sso.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ fetch, locals }) => {
  const sso = ssoApi(fetch, locals.token);
  const [info, status, tokens] = await Promise.all([
    sso.info(),
    sso.identity(),
    authApi(fetch, locals.token).tokens.list(),
  ]);

  return { sso: info, status, tokens };
};

const locale = (value: string): AdminLocale | '' =>
  (ADMIN_LOCALES as readonly string[]).includes(value)
    ? (value as AdminLocale)
    : '';

export const actions: Actions = {
  password: async ({ fetch, locals, request }) => {
    const form = await request.formData();
    try {
      await authApi(fetch, locals.token).changePassword({
        current: text(form, 'current'),
        password: text(form, 'password'),
      });
    } catch (caught) {
      return failFrom(caught);
    }
    return { notice: 'passwordChanged' };
  },

  tokenCreate: async ({ fetch, locals, request }) => {
    const form = await request.formData();
    const days = Math.trunc(Number(text(form, 'expiresInDays')));
    try {
      const created = await authApi(fetch, locals.token).tokens.create({
        name: text(form, 'name'),
        expiresInDays: days > 0 ? days : undefined,
      });
      // Shown once, to the user who created it; never stored by the web app.
      return { notice: 'tokenCreated', token: created.token };
    } catch (caught) {
      return failFrom(caught);
    }
  },

  tokenRevoke: async ({ fetch, locals, request }) => {
    const form = await request.formData();
    try {
      await authApi(fetch, locals.token).tokens.revoke(text(form, 'id'));
    } catch (caught) {
      return failFrom(caught);
    }
    return { notice: 'deleted' };
  },

  profile: async ({ fetch, locals, request }) => {
    const form = await request.formData();
    try {
      await authApi(fetch, locals.token).profile.update({
        email: text(form, 'email'),
        name: text(form, 'name'),
        slug: text(form, 'slug'),
        bio: text(form, 'bio'),
        locale: locale(text(form, 'locale')),
      });
    } catch (caught) {
      return failFrom(caught);
    }
    return { notice: 'saved' };
  },

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
