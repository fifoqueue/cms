import type { ApiApp } from '#api/http/services';
import { session } from '#api/http/session';
import { json } from '#api/http/respond';

export const routes = (app: ApiApp) =>
  session(app).get('', async ({ adminUi, user, query }) =>
    json({
      notices: (await adminUi?.notices(user, String(query.screen ?? ''))) ?? [],
    }),
  );
