import { dev } from '$app/env';
import type { Handle } from '@sveltejs/kit/hooks';
import { sequence } from '@sveltejs/kit/hooks';
import { CmsApiError } from '@cms/sdk/client';
import { authApi, installationApi } from '#lib/server/api.js';
import { createPageMinifier } from '#lib/server/html-minifier.js';
import { SESSION_COOKIE, endSession } from '#lib/server/session.js';

const OPEN_ADMIN_PATHS = [
  '/admin/login',
  '/admin/setup',
  '/admin/sso/callback',
];

const isProtected = (pathname: string) =>
  (pathname === '/admin' || pathname.startsWith('/admin/')) &&
  !OPEN_ADMIN_PATHS.includes(pathname);

/** Production pages are served minified; the dev server keeps rendered markup readable. */
const minifyPages: Handle = ({ event, resolve }) =>
  dev
    ? resolve(event)
    : resolve(event, { transformPageChunk: createPageMinifier() });

/** Resolves the session once per admin request and keeps signed-out users out of the admin area. */
const guardAdmin: Handle = async ({ event, resolve }) => {
  event.locals.token = event.cookies.get(SESSION_COOKIE) ?? null;
  event.locals.user = null;

  const installation = await installationApi(event.fetch).status();
  if (installation.setupRequired) {
    if (event.url.pathname !== '/admin/setup')
      return new Response(null, {
        status: 303,
        headers: { location: '/admin/setup', 'cache-control': 'no-store' },
      });
    return resolve(event);
  }

  if (event.locals.token && event.url.pathname.startsWith('/admin')) {
    event.locals.user = await authApi(event.fetch, event.locals.token)
      .me()
      .catch((caught: unknown) => {
        if (caught instanceof CmsApiError && caught.status === 401) return null;
        throw caught;
      });
    if (!event.locals.user) {
      endSession(event.cookies);
      event.locals.token = null;
    }
  }

  if (isProtected(event.url.pathname) && !event.locals.user) {
    return new Response(null, {
      status: 303,
      headers: { location: '/admin/login' },
    });
  }
  return resolve(event);
};

export const handle = sequence(minifyPages, guardAdmin);
