import type { Capability } from '@cms/sdk';
import { authorize } from '#api/domain/auth/authorization';
import { requireUser } from '#api/http/request';
import type { ApiApp } from '#api/http/services';

/**
 * Routes declared after `session(app)` in the same route file require a signed-in user
 * (401 otherwise) and receive it as `user`. With `capability`, users whose role lacks it get
 * 403. The guard stays local to that file's routes.
 */
export const session = (app: ApiApp, capability?: Capability) =>
  app.resolve(async ({ auth, request }) => {
    const user = await requireUser(auth, request);
    if (capability) authorize(user, capability);
    return { user };
  });
