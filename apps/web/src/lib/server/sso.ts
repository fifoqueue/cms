import { error, redirect } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import type { SsoStart } from '@cms/sdk';
import { createSsoClient } from '@cms/sdk/client';
import { apiUrl } from '#lib/server/api.js';
import { Errors, failFrom } from '#lib/server/errors.js';
import { ownerFor } from '#lib/server/sign-in.js';
import { redirectTarget } from '#lib/server/sign-in-view.js';
import { setPending } from '#lib/server/sso-cookie.js';
import { clientProof } from '#lib/server/visitor.js';

export const ssoApi = (fetch: typeof globalThis.fetch, token?: string | null) =>
  createSsoClient({ baseUrl: apiUrl, fetch }, token ?? undefined);

/**
 * Sends the signed-in user to `provider` to link the account they choose there. The callback
 * accepts the answer only with the pending cookie, so a response replayed into another browser
 * fails. Signing in with single sign-on is a sign-in method (`#lib/server/sign-in.js`).
 */
export const linkSso = async (
  event: Pick<
    RequestEvent,
    'fetch' | 'locals' | 'cookies' | 'url' | 'getClientAddress' | 'request'
  >,
  provider: string,
) => {
  let start: SsoStart;
  try {
    start = await ssoApi(event.fetch, event.locals.token).start(
      { provider, intent: 'link' },
      clientProof(event),
    );
  } catch (caught) {
    return failFrom(caught);
  }
  const target = redirectTarget({
    url: start.authorizationUrl,
    expiresAt: start.expiresAt,
  });
  if (!target) error(502, Errors.SignInRedirectInvalid);
  setPending(
    event.cookies,
    event.url,
    {
      transaction: start.transaction,
      flow: 'link',
      user: ownerFor(event, 'link'),
      back: null,
      step: null,
    },
    start.expiresAt,
  );
  redirect(303, target, { external: true });
};
