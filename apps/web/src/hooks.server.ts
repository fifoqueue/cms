import type { Handle } from '@sveltejs/kit/hooks';
import { sequence } from '@sveltejs/kit/hooks';
import { CmsApiError } from '@cms/sdk/client';
import { can } from '@cms/sdk/capabilities';
import {
  adminApi,
  authApi,
  contentApi,
  installationApi,
} from '#lib/server/api.js';
import { frontendSecret, pairFrontend } from '#lib/server/frontend-secret.js';
import { SESSION_COOKIE, endSession } from '#lib/server/session.js';

const OPEN_ADMIN_PATHS = [
  '/admin/login',
  '/admin/register',
  '/admin/setup',
  '/admin/sso/callback',
  '/admin/forgot-password',
  '/admin/password',
];

const isAdmin = (pathname: string) =>
  pathname === '/admin' || pathname.startsWith('/admin/');

const isProtected = (pathname: string) =>
  isAdmin(pathname) && !OPEN_ADMIN_PATHS.includes(pathname);

const KIB = 1024;
const MIB = 1024 * KIB;

const bodyLimit = (pathname: string) => {
  if (pathname === '/admin/media/upload') return 64 * MIB;
  if (pathname === '/admin/tools/transfer') return 17 * MIB;
  if (pathname === '/admin/plugins') return 6 * MIB;
  if (pathname.startsWith('/admin/content')) return 2 * MIB;
  if (pathname.startsWith('/admin/extensions/')) return 256 * KIB;
  return 64 * KIB;
};

/** Rejects oversized form actions before SvelteKit buffers or parses their bodies. */
const requestSize: Handle = async ({ event, resolve }) => {
  if (!['POST', 'PUT', 'PATCH'].includes(event.request.method))
    return resolve(event);

  const header = event.request.headers.get('content-length');
  const length = header === null ? NaN : Number(header);
  if (!Number.isSafeInteger(length) || length < 0)
    return new Response(null, { status: 411 });
  if (length > bodyLimit(event.url.pathname))
    return new Response(null, { status: 413 });

  return resolve(event);
};

/**
 * Admin responses (sign-in redirects included) and error responses are never indexed. Public
 * entries get their robots meta from the page itself. Headers are copied because a returned
 * response may have immutable headers.
 */
const robotsHeader: Handle = async ({ event, resolve }) => {
  const response = await resolve(event);
  if (!isAdmin(event.url.pathname) && response.status < 400) return response;
  const headers = new Headers(response.headers);
  headers.set('x-robots-tag', 'noindex, nofollow');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};

/** Cookies that make a public page differ per visitor (sessions, unlocked entries, previews). */
const PERSONAL_COOKIE = /^(cms_session|cms_unlock_|cms_theme_preview)/;

/** Settings → Reading `cacheSeconds`, re-read at most once a minute. */
let caching = { seconds: 0, until: 0 };

const cacheSeconds = async (fetch: typeof globalThis.fetch) => {
  if (Date.now() < caching.until) return caching.seconds;
  const seconds = await contentApi(fetch)
    .reading()
    .then(
      (reading) => reading.cacheSeconds,
      () => 0,
    );
  caching = { seconds, until: Date.now() + 60_000 };
  return seconds;
};

/**
 * Lets a CDN or reverse proxy keep public pages briefly (Settings → Reading). Only plain
 * anonymous GETs qualify: no visitor cookies, no cookies set, and no caching rules of their own.
 */
const publicCache: Handle = async ({ event, resolve }) => {
  const response = await resolve(event);
  if (
    (event.request.method !== 'GET' && event.request.method !== 'HEAD') ||
    isAdmin(event.url.pathname) ||
    response.status !== 200 ||
    response.headers.has('set-cookie') ||
    response.headers.has('cache-control') ||
    event.cookies.getAll().some(({ name }) => PERSONAL_COOKIE.test(name))
  )
    return response;
  const seconds = await cacheSeconds(event.fetch);
  if (!seconds) return response;
  const headers = new Headers(response.headers);
  headers.set(
    'cache-control',
    `public, max-age=0, s-maxage=${seconds}, stale-while-revalidate=${seconds * 10}`,
  );
  headers.append('vary', 'cookie');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};

/** Setup cannot become required again once completed (reinstalling is blocked), so stop asking. */
let installed = false;

/** Resolves the session once per admin request and keeps signed-out users out of the admin area. */
const guardAdmin: Handle = async ({ event, resolve }) => {
  event.locals.token = event.cookies.get(SESSION_COOKIE) ?? null;
  event.locals.user = null;

  if (!installed) {
    const installation = await installationApi(event.fetch).status();
    if (installation.setupRequired) {
      if (event.url.pathname !== '/admin/setup')
        return new Response(null, {
          status: 303,
          headers: { location: '/admin/setup', 'cache-control': 'no-store' },
        });
      return resolve(event);
    }
    installed = true;
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
    } else if (!frontendSecret() && can(event.locals.user, 'settings.manage'))
      await pairFrontend(adminApi(event.fetch, event.locals.token));
  }

  if (isProtected(event.url.pathname) && !event.locals.user) {
    // Enhanced forms get an action redirect they can intercept (the editor keeps unsaved text).
    if (event.request.headers.get('x-sveltekit-action') === 'true')
      return Response.json({
        type: 'redirect',
        status: 303,
        location: '/admin/login',
      });
    return new Response(null, {
      status: 303,
      headers: { location: '/admin/login' },
    });
  }
  return resolve(event);
};

export const handle = sequence(
  requestSize,
  publicCache,
  robotsHeader,
  guardAdmin,
);
