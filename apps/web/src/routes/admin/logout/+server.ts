import { redirect } from '@sveltejs/kit';
import { authApi, contentApi } from '#lib/server/api.js';
import { text } from '#lib/server/errors.js';
import { RETURN_PARAM, returnPath } from '#lib/server/return-path.js';
import { endSession, markSignedOut } from '#lib/server/session-cookie.js';
import { clearPending } from '#lib/server/sso-cookie.js';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({
  fetch,
  locals,
  cookies,
  url,
  request,
}) => {
  const loginPath = await contentApi(fetch)
    .site()
    .then((site) => site.loginPath)
    .catch(() => '/login');
  // "Sign in again" returns to the page it came from; plain sign-out posts no return path.
  const asked = await request
    .formData()
    .then((form) => text(form, RETURN_PARAM))
    .catch(() => '');
  const back = asked && returnPath(asked, loginPath);
  await authApi(fetch, locals.token)
    .logout()
    .catch(() => undefined);
  endSession(cookies);
  // A half-finished enrollment or link must not reach whoever signs in next.
  clearPending(cookies, url);
  // The sign-in page clears this tab's editor backups only after a completed sign-out.
  markSignedOut(cookies, url);
  redirect(
    303,
    back && back !== '/admin'
      ? `${loginPath}?${new URLSearchParams({ [RETURN_PARAM]: back })}`
      : loginPath,
  );
};
