import { json } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';
import { session } from '#api/http/session';

export const routes = (app: ApiApp) =>
  session(app, 'content.create').get('', async ({ patterns, user }) =>
    json(await patterns.contributions(user)),
  );
