import type { RequestEvent } from '@sveltejs/kit';
import type { RouteId } from '$app/types';
import { routeMatcher } from '#lib/route-match.js';

/**
 * Credential-less endpoints: `+server` routes that other servers call without cookies or an
 * `Origin`, authenticated only by a signed token in the request body that the API verifies.
 * Their handlers never read or set cookies, `locals.token` or `locals.user`. Declaring a route
 * here is all a new one needs: the cross-site form check (`#lib/server/csrf.js`) skips it, the
 * admin guard neither resolves a session for it nor asks to sign in, and sign-in never returns
 * to it.
 */
const routes: readonly RouteId[] = [
  // OpenID Connect Back-Channel Logout 1.0: the provider posts a `logout_token`.
  '/admin/sso/backchannel-logout',
];

const ids = new Set<string | null>(routes);

/**
 * Whether `event` reaches a credential-less endpoint. A remote function call never does: its
 * route is the page the caller names.
 */
export const isCredentialLess = (
  event: Pick<RequestEvent, 'route' | 'isRemoteRequest'>,
) => !event.isRemoteRequest && ids.has(event.route.id);

/** Whether a URL pathname (encoded, as `URL#pathname` gives it) is a credential-less endpoint. */
export const isCredentialLessPath = routeMatcher(routes);
