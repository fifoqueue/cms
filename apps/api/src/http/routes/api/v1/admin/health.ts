import { json } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';
import { session } from '#api/http/session';

export const routes = (app: ApiApp) =>
  session(app).get('', async ({ siteHealth, user }) =>
    json(await siteHealth.report(user)),
  );
