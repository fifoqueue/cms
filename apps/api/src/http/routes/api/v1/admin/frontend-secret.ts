import { json } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';
import { session } from '#api/http/session';

/** The secret the web server sends to prove visitors' addresses; fetched by the web server itself. */
export const routes = (app: ApiApp) =>
  session(app, 'settings.manage').get('', ({ frontendSecret }) =>
    json({ secret: frontendSecret }),
  );
