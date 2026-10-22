import { json } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';
import { session } from '#api/http/session';

export const routes = (app: ApiApp) =>
  session(app).get('', async ({ comments, user }) =>
    json(await comments.counts(user)),
  );
