import { error, redirect } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { authApi, contentApi } from '#lib/server/api.js';
import { Errors, failFrom, text } from '#lib/server/errors.js';
import { RETURN_PARAM, returnPath } from '#lib/server/return-path.js';
import { startSession, takeSignedOut } from '#lib/server/session-cookie.js';
import { startStep } from '#lib/server/sign-in.js';
import { methodView } from '#lib/server/sign-in-view.js';
import { clearPending } from '#lib/server/sso-cookie.js';
import { allowCaptcha } from '#lib/server/captcha.js';
import { visitorOf } from '#lib/server/visitor.js';

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

  const [info, captcha, membership] = await Promise.all([
    authApi(event.fetch).signIn.info(),
    contentApi(event.fetch).captcha(),
    authApi(event.fetch).membership(),
  ]);
  return {
    kind: 'login' as const,
    signIn: {
      methods: info.methods.map(methodView),
      passwordReset: info.passwordReset,
    },
    captcha: allowCaptcha(event, captcha),
    membership,
    back,
    signedOut: takeSignedOut(event.cookies, event.url),
  };
};

/** Starts the chosen method (its form, or one of its buttons) with the same-site destination. */
export const loginStartAction = async (event: RequestEvent) => {
  const path = await loginPath(event);
  const form = await event.request.formData();
  return startStep(event, form, returnPath(text(form, RETURN_PARAM), path));
};

/** Sign-in with email and a one-time recovery code, protected like password sign-in. */
export const loginRecoverAction = async (event: RequestEvent) => {
  const path = await loginPath(event);
  const form = await event.request.formData();
  const email = text(form, 'email');
  const back = returnPath(text(form, RETURN_PARAM), path);
  try {
    const session = await authApi(event.fetch).recover(
      { email, code: text(form, 'code') },
      visitorOf(event, form),
    );
    // Whatever was pending belonged to an earlier visitor of this browser.
    clearPending(event.cookies, event.url);
    startSession(event.cookies, session, event.url);
  } catch (caught) {
    return failFrom(caught, { email, back, recovery: true });
  }
  redirect(303, back);
};
