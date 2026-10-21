import { requireUser } from './request';
import type { ApiApp } from './services';

/**
 * Routes declared after `session(app)` in the same route file require a signed-in user
 * (401 otherwise) and receive it as `user`. The guard stays local to that file's routes.
 */
export const session = (app: ApiApp) =>
  app.resolve(async ({ auth, request }) => ({
    user: await requireUser(auth, request),
  }));
