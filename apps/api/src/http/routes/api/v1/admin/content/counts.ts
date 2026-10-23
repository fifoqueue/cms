import type { ApiApp } from '#api/http/services';
import { session } from '#api/http/session';
import { json } from '#api/http/respond';
export const routes = (app: ApiApp) =>
  session(app, 'content.create').get(
    '',
    async ({ adminContent, user, query }) =>
      json(await adminContent.counts(query, user)),
  );
