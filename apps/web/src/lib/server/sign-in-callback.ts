import { redirect } from '@sveltejs/kit';
import type { ServerLoadEvent } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { CmsApiError } from '@cms/sdk/client';
import { authApi } from '#lib/server/api.js';
import { RETURN_PARAM, returnPath } from '#lib/server/return-path.js';
import {
  ENROLL_ANCHOR,
  advance,
  loginPathOf,
  ownsPending,
  stepPage,
} from '#lib/server/sign-in.js';
import { readPending, takePending } from '#lib/server/sso-cookie.js';
import { ssoApi } from '#lib/server/sso.js';
import { visitorOf } from '#lib/server/visitor.js';

type Event = Pick<
  ServerLoadEvent,
  'fetch' | 'cookies' | 'url' | 'locals' | 'getClientAddress' | 'setHeaders'
>;

/**
 * Where a redirect-based method (an identity provider, or a plugin's) sends the browser back.
 * Only the API sees the query; it verifies everything. The pending cookie is taken once, so
 * a response replayed into another browser fails. A session opens the saved destination, any
 * further step (a second factor) is shown by the step page, links end on the account page.
 */
export const signInCallback = async (event: Event) => {
  event.setHeaders({
    'cache-control': 'private, no-store',
    'referrer-policy': 'no-referrer',
  });
  // A step being shown is not this callback's: a cross-site visit here leaves it untouched.
  const shown = readPending(event.cookies, event.url);
  if (shown?.step)
    redirect(
      303,
      shown.flow === 'enroll'
        ? `${resolve('/admin/(app)/account')}#${ENROLL_ANCHOR}`
        : stepPage(),
    );
  const taken = takePending(event.cookies, event.url);
  // An enrollment or link started by someone else on this browser is dropped, not continued.
  const pending = taken && ownsPending(event, taken) ? taken : null;
  const flow =
    pending?.flow ??
    (event.locals.user ? ('link' as const) : ('login' as const));
  const loginPath = await loginPathOf(event.fetch);
  const back = pending?.back ? returnPath(pending.back, loginPath) : null;
  const view = {
    /** Where the "back" button goes. */
    flow,
    retry:
      back && back !== '/admin'
        ? `${loginPath}?${new URLSearchParams({ [RETURN_PARAM]: back })}`
        : loginPath,
  };
  if (!pending) return { ...view, expired: true, done: false };

  try {
    if (pending.flow === 'link') {
      const result = await ssoApi(event.fetch, event.locals.token).callback({
        transaction: pending.transaction,
        query: event.url.search,
      });
      if (result.kind === 'linked')
        redirect(
          303,
          `${resolve('/admin/(app)/account')}?notice=ssoAccountLinked`,
        );
      await advance(
        event,
        { kind: 'session', session: result.session },
        'login',
        pending.back,
      );
    } else
      await advance(
        event,
        await authApi(
          event.fetch,
          pending.flow === 'enroll' ? event.locals.token : undefined,
        ).signIn.continue(
          { transaction: pending.transaction, query: event.url.search },
          visitorOf(event),
        ),
        pending.flow,
        pending.back,
        pending.owner,
      );
    // Only a setup that finished without signing in gets here.
    return { ...view, expired: false, done: true };
  } catch (caught) {
    if (caught instanceof CmsApiError && caught.status < 500)
      return {
        ...view,
        expired: false,
        done: false,
        message: caught.message,
        code: caught.code,
      };
    throw caught;
  }
};
