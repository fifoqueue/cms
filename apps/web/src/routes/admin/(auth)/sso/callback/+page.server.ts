import { redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { CmsApiError } from '@cms/sdk/client';
import { Errors } from '#lib/server/errors.js';
import { startSession } from '#lib/server/session-cookie.js';
import { ssoApi, takeSsoTransaction } from '#lib/server/sso.js';
import type { PageServerLoad } from './$types';

/** The identity provider redirects here. Only the API sees the code; it verifies everything. */
export const load: PageServerLoad = async ({ url, cookies, fetch, locals }) => {
  const transaction = takeSsoTransaction(cookies, url);
  // Linking starts from the account page, so a signed-in user goes back there.
  const back = locals.user ? 'account' : 'login';

  if (!transaction)
    return {
      back,
      message: Errors.SsoRequestExpired,
    };

  let result;

  try {
    result = await ssoApi(fetch, locals.token).callback({
      transaction,
      query: url.search,
    });
  } catch (caught) {
    if (caught instanceof CmsApiError && caught.status < 500)
      return { back, message: caught.message };
    throw caught;
  }

  if (result.kind === 'linked') redirect(303, resolve('/admin/(app)/account'));

  startSession(cookies, result.session, url);
  redirect(303, resolve('/admin/(app)'));
};
