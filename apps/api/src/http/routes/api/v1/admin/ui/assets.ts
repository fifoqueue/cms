import type { ApiApp } from '#api/http/services';
import { session } from '#api/http/session';
import { json } from '#api/http/respond';

export const routes = (app: ApiApp) =>
  session(app).get('', ({ adminUi, user, query }) =>
    json(adminUi?.assets(user, String(query.screen ?? '')) ?? []),
  );
