import type { Handle, HandleServerError } from '@sveltejs/kit/hooks';
import type { RequestEvent } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { CmsApiError } from '@cms/sdk/client';
import { can } from '@cms/sdk/capabilities';
import { CONTENT_UNLOCK_HEADER } from '@cms/sdk';
import {
  adminApi,
  authApi,
  contentApi,
  installationApi,
} from '#lib/server/api.js';
import { frontendSecret, pairFrontend } from '#lib/server/frontend-secret.js';
import { isCredentialLess } from '#lib/server/credential-less.js';
import { csrf } from '#lib/server/csrf.js';
import { RETURN_PARAM } from '#lib/server/return-path.js';
import { endSession, sessionToken } from '#lib/server/session-cookie.js';
import { clearPending } from '#lib/server/sso-cookie.js';
import { withWidgetOrigins } from '#lib/server/captcha.js';
import { startWebFunctions } from '#lib/server/web-functions.js';
import { webHooks } from '#lib/server/web-functions.js';
import { renderRequest } from '#lib/server/render-request.js';
import { revalidateHtml } from '#lib/server/html-revalidation.js';
import { siteLayout } from '#lib/server/site-layout.js';
import { loadErrorData } from '#lib/server/theme-queries.js';
import { entryRepresentations } from '#lib/server/entry-representations.js';
import {
  keyedAssetHtml,
  renderHeaders,
  withAssetOrigins,
} from '#lib/server/render-security.js';

export const init = startWebFunctions;

/** Kit 3 calls this for expected and unexpected errors, including data navigations. */
export const handleError: HandleServerError = async ({
  event,
  kind,
  error,
}) => {
  if (kind === 'unknown') console.error('Unhandled web error', error);
  if (!event.route.id?.startsWith('/(site)')) return;
  const status =
    kind === 'unknown'
      ? error instanceof CmsApiError
        ? error.status
        : 500
      : error.status;

  try {
    const { theme, reading } = await siteLayout(event);

    return {
      status,
      themeError: await loadErrorData(
        contentApi(event.fetch),
        theme,
        reading.timeZone,
        status,
      ),
    };
  } catch {
    return { status };
  }
};

const publicRender: Handle = ({ event, resolve }) => {
  if (!event.route.id?.startsWith('/(site)')) return resolve(event);

  return renderRequest.run({ bus: webHooks }, async () => {
    const state = renderRequest.getStore()!;
    const response = await resolve(event, {
      transformPageChunk: async ({ html }) => {
        const result = await state.pending;

        return result
          ? html.replace(
              '<body ',
              `<body class="${result.render.bodyClasses.join(' ')}" `,
            )
          : html;
      },
    });
    const result = await state.pending;

    if (!result) return response;
    const headers = new Headers(response.headers);

    renderHeaders(headers, result.render.headers);
    const policy = headers.get('content-security-policy');

    if (policy)
      headers.set(
        'content-security-policy',
        withAssetOrigins(policy, result.render.assets, event.url),
      );

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  });
};

/**
 * Writes the admin screen's registered scripts into the document (`data-cms-asset` keyed) outside
 * the rendered components, so each runs once per document; later screens add theirs in the browser.
 */
const adminScripts: Handle = ({ event, resolve }) => {
  if (!event.route.id?.startsWith('/admin/(app)')) return resolve(event);

  return resolve(event, {
    transformPageChunk: ({ html }) => {
      const scripts = (event.locals.adminAssets ?? []).filter(
        (asset) => asset.kind === 'script',
      );
      const tags = (placement: 'head' | 'footer') =>
        scripts
          .filter((asset) => asset.placement === placement)
          .map(keyedAssetHtml)
          .join('');

      return scripts.length
        ? html
            .replace('</head>', `${tags('head')}</head>`)
            .replace('</body>', `${tags('footer')}</body>`)
        : html;
    },
  });
};

const OPEN_ADMIN_PATHS = [
  '/admin/register',
  '/admin/setup',
  '/admin/sso/callback',
  '/admin/sso/signed-out',
  '/admin/sign-in',
  '/admin/sign-in/callback',
  '/admin/forgot-password',
  '/admin/password',
];

const isAdmin = (pathname: string) =>
  pathname === '/admin' || pathname.startsWith('/admin/');

const isProtected = (pathname: string) =>
  isAdmin(pathname) && !OPEN_ADMIN_PATHS.includes(pathname);

const isUnknownAdmin = (event: Pick<RequestEvent, 'route' | 'url'>) =>
  isAdmin(event.url.pathname) && !event.route.id?.startsWith('/admin');

/** A copy of `response` that no shared cache keeps, with `status`. */
const privately = (response: Response, status = response.status) => {
  const headers = new Headers(response.headers);

  headers.set('cache-control', 'private, no-store');

  return new Response(response.body, { status, headers });
};

/**
 * An unknown admin path: the public catch-all renders it as the site's own missing page, so a
 * hidden admin screen answered with it looks like any other missing page.
 */
const NOT_FOUND_PATH = '/admin/__not-found';

const siteNotFound = async (event: RequestEvent) =>
  privately(await event.fetch(new URL(NOT_FOUND_PATH, event.url)), 404);

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
  if (isUnknownAdmin(event)) return resolve(event);
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
 * entries get their robots meta from the page itself. Admin responses are never framed; public
 * pages only by the site itself (the admin site editor previews them), and pages share no
 * browsing context group with other origins.
 */
const responseSecurity: Handle = async ({ event, resolve }) => {
  const response = await resolve(event);
  const admin = isAdmin(event.url.pathname);
  const origins = event.locals.captchaOrigins;
  const page = response.headers.get('content-type')?.startsWith('text/html');
  const internal =
    event.isDataRequest ||
    event.url.pathname.endsWith('/__data.json') ||
    event.url.pathname.startsWith('/_app/') ||
    event.url.pathname.startsWith('/api/') ||
    event.url.pathname.startsWith('/preview/');
  const feed = /^application\/(?:(?:rss|atom)\+xml|feed\+json)(?:;|$)/i.test(
    response.headers.get('content-type') ?? '',
  );

  if (
    !admin &&
    !internal &&
    !feed &&
    !page &&
    response.status < 400 &&
    !(origins && response.headers.has('content-security-policy'))
  )
    return response;
  const headers = new Headers(response.headers);

  if (internal) headers.set('x-robots-tag', 'noindex, nofollow');
  if (feed) headers.set('x-robots-tag', 'noindex, follow');

  if (admin || response.status >= 400) {
    headers.set('x-robots-tag', 'noindex, nofollow');
    headers.set('cache-control', 'private, no-store');
  }

  if (admin || page) {
    // Sign-in responses already carry their own `frame-ancestors`; one is enough.
    if (!headers.get('content-security-policy')?.includes('frame-ancestors'))
      headers.append(
        'content-security-policy',
        admin ? "frame-ancestors 'none'" : "frame-ancestors 'self'",
      );
    headers.set('x-frame-options', admin ? 'DENY' : 'SAMEORIGIN');
  }

  if (page) headers.set('cross-origin-opener-policy', 'same-origin');
  // Only pages that render the captcha widget admit its origins, in every policy they send.
  const policy = headers.get('content-security-policy');

  if (origins && policy)
    headers.set(
      'content-security-policy',
      policy
        .split(',')
        .map((part) => withWidgetOrigins(part, origins))
        .join(', '),
    );
  // Admin screens admit the origins of their registered assets; public policies never change here.
  const assets = admin ? event.locals.adminAssets : undefined;
  const adminPolicy = headers.get('content-security-policy');

  if (assets?.length && adminPolicy)
    headers.set(
      'content-security-policy',
      withAssetOrigins(adminPolicy, assets, event.url),
    );

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};

/** Cookies that make a public page differ per visitor (sessions, unlocked entries, previews). */
const PERSONAL_COOKIE =
  /^(?:(?:__Host-)?cms_(?:session|sso|signed_out|theme_preview|commenter|commenter_proof)$|cms_(?:unlock_|pending_))/;

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
 * anonymous HTML GETs qualify: no personal cookies, no cookies set, and no caching rules of their own.
 * Credential-less endpoints are never cached and never have their cookies read.
 */
const publicCache: Handle = async ({ event, resolve }) => {
  if (isCredentialLess(event)) return resolve(event);
  const personal = event.cookies
    .getAll()
    .some(({ name }) => PERSONAL_COOKIE.test(name));
  const privateRequest =
    event.isDataRequest ||
    event.url.pathname.endsWith('/__data.json') ||
    personal ||
    event.request.headers.has('authorization') ||
    event.request.headers.has(CONTENT_UNLOCK_HEADER) ||
    isAdmin(event.url.pathname) ||
    event.route.id === '/(site)/preview/[token]';

  let resolved = event;

  if (privateRequest && ['GET', 'HEAD'].includes(event.request.method)) {
    const headers = new Headers(event.request.headers);

    headers.delete('if-none-match');
    headers.delete('if-modified-since');
    // Bun keeps the source request's headers when `init.headers` is passed with a Request input.
    resolved = {
      ...event,
      request: new Request(event.request.url, {
        method: event.request.method,
        headers,
        signal: event.request.signal,
      }),
    };
  }

  const response = await resolve(resolved);

  if (
    privateRequest ||
    response.headers.has('set-cookie') ||
    /\b(?:private|no-store)\b/i.test(
      response.headers.get('cache-control') ?? '',
    ) ||
    event.cookies.getAll().some(({ name }) => PERSONAL_COOKIE.test(name))
  ) {
    const headers = new Headers(response.headers);

    headers.set('cache-control', 'private, no-store');
    headers.delete('etag');
    headers.delete('last-modified');
    const status = response.status === 304 ? 500 : response.status;

    if (status !== response.status) headers.delete('content-length');
    const vary = new Set(
      (headers.get('vary') ?? '')
        .split(',')
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean),
    );

    if (!vary.has('*')) {
      if (!vary.has('cookie')) headers.append('vary', 'Cookie');
      for (const name of ['Authorization', CONTENT_UNLOCK_HEADER])
        if (event.request.headers.has(name) && !vary.has(name.toLowerCase()))
          headers.append('vary', name);
    }

    return new Response(response.body, {
      status,
      statusText: status === response.status ? response.statusText : undefined,
      headers,
    });
  }

  if (
    (event.request.method !== 'GET' && event.request.method !== 'HEAD') ||
    isAdmin(event.url.pathname) ||
    !event.route.id?.startsWith('/(site)') ||
    event.isDataRequest ||
    !response.headers.get('content-type')?.startsWith('text/html') ||
    response.status !== 200 ||
    response.headers.has('set-cookie') ||
    response.headers.has('cache-control')
  )
    return response;
  const seconds = await cacheSeconds(event.fetch);

  return revalidateHtml(event.request, response, seconds);
};

/** Uses the adapter's trusted request origin, never raw forwarding headers from the caller. */
const canonicalOrigin: Handle = async ({ event, resolve }) => {
  if (
    !['GET', 'HEAD'].includes(event.request.method) ||
    !event.route.id?.startsWith('/(site)') ||
    isAdmin(event.url.pathname) ||
    event.url.pathname.startsWith('/preview/') ||
    ['/health', '/healthz'].includes(event.url.pathname)
  )
    return resolve(event);
  const { reading, seo, site } = await siteLayout(event);

  if (
    reading.canonicalOrigin &&
    seo.siteUrl &&
    event.url.pathname !== site.loginPath
  ) {
    const origin = new URL(seo.siteUrl).origin;

    if (event.url.origin !== origin)
      return new Response(null, {
        status: 301,
        headers: {
          location: `${origin}${event.url.pathname}${event.url.search}`,
          'cache-control': 'private, no-store',
        },
      });
  }

  return resolve(event);
};

/** Setup cannot become required again once completed (reinstalling is blocked), so stop asking. */
let installed = false;

/**
 * Resolves the session once per admin request and keeps signed-out users out of the admin area.
 * Credential-less endpoints get no session and no sign-in requirement; their cookies are not read.
 */
const guardAdmin: Handle = async ({ event, resolve }) => {
  event.locals.token = null;
  event.locals.user = null;

  if (isCredentialLess(event)) return resolve(event);
  event.locals.token = sessionToken(event.cookies, event.url);

  // Public catch-alls can match unknown `/admin/*` paths; none may become an auth redirect.
  if (isUnknownAdmin(event)) return privately(await resolve(event));

  if (!installed) {
    const installation = await installationApi(event.fetch).status();

    if (installation.setupRequired) {
      if (event.url.pathname !== '/admin/setup')
        return new Response(null, {
          status: 303,
          headers: {
            location: '/admin/setup',
            'cache-control': 'private, no-store',
          },
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
      clearPending(event.cookies, event.url);
      event.locals.token = null;
    } else {
      if (!frontendSecret() && can(event.locals.user, 'settings.manage'))
        await pairFrontend(adminApi(event.fetch, event.locals.token));
    }
  }

  if (isProtected(event.url.pathname) && !event.locals.user) {
    const site = await contentApi(event.fetch)
      .site()
      .catch(() => null);

    if (!site?.showLogin) return siteNotFound(event);
    // Enhanced forms get an action redirect they can intercept (the editor keeps unsaved text).
    if (event.request.headers.get('x-sveltekit-action') === 'true')
      return Response.json(
        {
          type: 'redirect',
          status: 303,
          location: site.loginPath,
        },
        { headers: { 'cache-control': 'private, no-store' } },
      );
    // Only a page visit can be repeated after signing in; a form post cannot.
    const back =
      event.request.method === 'GET' && event.url.pathname !== '/admin'
        ? `?${new URLSearchParams({ [RETURN_PARAM]: `${event.url.pathname}${event.url.search}` })}`
        : '';

    return new Response(null, {
      status: 303,
      headers: {
        location: `${site.loginPath}${back}`,
        'cache-control': 'private, no-store',
      },
    });
  }

  return resolve(event);
};

/** Languages written right to left (primary subtags). */
const RTL = new Set([
  'ar',
  'ckb',
  'dv',
  'fa',
  'he',
  'ps',
  'sd',
  'ug',
  'ur',
  'yi',
]);

/** `<html lang dir>` from the site locale; anything that is not a language tag counts as `en`. */
const documentLanguage: Handle = ({ event, resolve }) =>
  resolve(event, {
    transformPageChunk: ({ html }) => {
      const lang = /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(
        event.locals.lang ?? '',
      )
        ? event.locals.lang!
        : 'en';
      const primary = lang.split('-')[0]!.toLowerCase();

      return html
        .replace('%lang%', lang)
        .replace('%dir%', RTL.has(primary) ? 'rtl' : 'ltr');
    },
  });

export const handle = sequence(
  csrf,
  requestSize,
  publicCache,
  responseSecurity,
  guardAdmin,
  canonicalOrigin,
  entryRepresentations,
  publicRender,
  adminScripts,
  documentLanguage,
);
