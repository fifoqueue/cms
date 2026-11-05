import { backchannelLogoutSchema } from '@cms/sdk';
import { CmsApiError } from '@cms/sdk/client';
import { authApi } from '#lib/server/api.js';
import { text } from '#lib/server/errors.js';
import type { RequestHandler } from './$types';

/** Responses to the provider are never stored. */
const headers = { 'cache-control': 'no-store' };

const invalid = () =>
  Response.json({ error: 'invalid_request' }, { status: 400, headers });

/**
 * OpenID Connect Back-Channel Logout 1.0: the provider posts a form-encoded `logout_token`, and
 * the API verifies it and ends the sessions it names. A credential-less endpoint
 * (`#lib/server/credential-less.js`): the token is forwarded without a session token. 200 with
 * an empty body on success; 400 `invalid_request` for a missing or malformed body or a token the
 * API refuses; any other failure is thrown (500, details in the server log only).
 */
export const POST: RequestHandler = async ({ fetch, request }) => {
  const form = await request.formData().catch(() => null);
  const input = backchannelLogoutSchema.safeParse({
    logoutToken: form ? text(form, 'logout_token') : '',
  });

  if (!input.success) return invalid();

  try {
    await authApi(fetch).backchannelLogout(input.data);
  } catch (caught) {
    if (caught instanceof CmsApiError && caught.status === 400)
      return invalid();
    throw caught;
  }

  return new Response(null, { headers });
};
