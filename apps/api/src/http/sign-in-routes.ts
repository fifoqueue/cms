import type { ApiApp } from '#api/http/services';

/** Authentication responses, including failures, must not be cached. */
export const signInRoutes = (app: ApiApp) =>
  app.onBeforeHandle(({ set }) => {
    set.headers['cache-control'] = 'private, no-store';
  });
