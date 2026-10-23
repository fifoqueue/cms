import { currentUser, unlockProofs } from '#api/http/request';
import { json } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';

/** `?path=` is the percent-encoded request pathname, sent as a regular (encoded) query value. */
export const routes = (app: ApiApp) =>
  app.get('', async ({ permalinkResolver, query, request, auth, set }) => {
    const user = await currentUser(auth, request);
    const proofs = unlockProofs(request);
    if (user || proofs.length)
      set.headers['cache-control'] = 'private, no-store';
    return json(await permalinkResolver.resolve(query, proofs, user));
  });
