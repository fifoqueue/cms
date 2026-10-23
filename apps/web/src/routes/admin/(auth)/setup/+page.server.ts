import { fail, redirect } from '@sveltejs/kit';
import { installationApi } from '#lib/server/api.js';
import { Errors, failFrom, text } from '#lib/server/errors.js';
import { startSession } from '#lib/server/session.js';
import type { Actions, PageServerLoad } from './$types';

const INSTALL_KEY_COOKIE = 'cms_install_key';
const keyOptions = {
  path: '/admin/setup',
  httpOnly: true,
  sameSite: 'strict' as const,
};

export const load: PageServerLoad = async ({ fetch, cookies, setHeaders }) => {
  setHeaders({ 'cache-control': 'no-store' });
  const status = await installationApi(fetch).status();
  if (!status.setupRequired) {
    cookies.delete(INSTALL_KEY_COOKIE, { path: '/admin/setup' });
    redirect(303, '/admin/login');
  }
  return { ...status, hasKey: Boolean(cookies.get(INSTALL_KEY_COOKIE)) };
};

export const actions: Actions = {
  database: async ({ request, fetch, cookies }) => {
    const form = await request.formData();
    const values = {
      host: text(form, 'host'),
      port: Number(text(form, 'port')),
      database: text(form, 'database'),
      username: text(form, 'username'),
    };
    const token = text(form, 'token');
    try {
      await installationApi(fetch).database({
        ...values,
        password: text(form, 'password'),
        token,
      });
      cookies.set(INSTALL_KEY_COOKIE, token, { ...keyOptions, maxAge: 1800 });
    } catch (caught) {
      const failure = failFrom(caught);
      return fail(failure.status, { ...failure.data, databaseValues: values });
    }
    redirect(303, '/admin/setup');
  },
  complete: async ({ request, fetch, cookies, url }) => {
    const form = await request.formData();
    const values = {
      title: text(form, 'title'),
      description: text(form, 'description'),
      locale: text(form, 'locale'),
      name: text(form, 'name'),
      email: text(form, 'email'),
    };
    if (text(form, 'password') !== text(form, 'confirmation'))
      return fail(400, {
        message: Errors.PasswordMismatch,
        siteValues: values,
      });
    try {
      const grant = await installationApi(fetch).complete({
        token: text(form, 'token') || cookies.get(INSTALL_KEY_COOKIE) || '',
        siteUrl: url.origin,
        admin: {
          name: values.name,
          email: values.email,
          password: text(form, 'password'),
        },
        site: {
          title: values.title,
          description: values.description,
          locale: values.locale,
        },
      });
      startSession(cookies, grant);
      cookies.delete(INSTALL_KEY_COOKIE, { path: '/admin/setup' });
    } catch (caught) {
      const failure = failFrom(caught);
      return fail(failure.status, { ...failure.data, siteValues: values });
    }
    redirect(303, '/admin');
  },
};
