import { error, redirect } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { authApi, contentApi } from '#lib/server/api.js';
import { Errors, failFrom, text } from '#lib/server/errors.js';
import { RETURN_PARAM, returnPath } from '#lib/server/return-path.js';
import { startSession, takeSignedOut } from '#lib/server/session-cookie.js';
import { rememberSsoTransaction, ssoApi } from '#lib/server/sso.js';
import { clientProof, visitorOf } from '#lib/server/visitor.js';

const loginPath = async (event: RequestEvent) => {
  const path = (await contentApi(event.fetch).site()).loginPath;
  if (event.url.pathname !== path) error(404, Errors.NotFound);
  return path;
};

/** Login data shared by every configured public path, using site data its loader already read. */
export const loginPage = async (
  event: RequestEvent,
  path: string,
  signedIn: boolean,
) => {
  event.setHeaders({
    'cache-control': 'private, no-store',
    'content-security-policy': "frame-ancestors 'none'",
    'x-frame-options': 'DENY',
    'x-robots-tag': 'noindex, nofollow',
  });
  if ((await authApi(event.fetch).status()).setupRequired)
    redirect(303, '/admin/setup');
  const back = returnPath(event.url.searchParams.get(RETURN_PARAM), path);
  if (signedIn) redirect(303, back);

  const [sso, captcha, membership] = await Promise.all([
    ssoApi(event.fetch).info(),
    contentApi(event.fetch).captcha(),
    authApi(event.fetch).membership(),
  ]);
  return {
    kind: 'login' as const,
    sso,
    captcha,
    membership,
    back,
    signedOut: takeSignedOut(event.cookies, event.url),
  };
};

/** Sends the browser to the identity provider and remembers its same-site destination. */
export const loginSsoAction = async (event: RequestEvent) => {
  const path = await loginPath(event);
  const form = await event.request.formData();
  const back = returnPath(text(form, RETURN_PARAM), path);
  let start;

  try {
    start = await ssoApi(event.fetch).start(
      { intent: 'login' },
      clientProof(event.getClientAddress()),
    );
  } catch (caught) {
    return failFrom(caught, { back });
  }

  rememberSsoTransaction(event.cookies, start, event.url, back);
  redirect(303, start.authorizationUrl, { external: true });
};

/** Password login at the configured public route. */
export const loginAction = async (event: RequestEvent) => {
  const path = await loginPath(event);
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
    return failFrom(caught, {
      email,
      back: returnPath(text(form, RETURN_PARAM), path),
    });
  }
  redirect(303, returnPath(text(form, RETURN_PARAM), path));
};
