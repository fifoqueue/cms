import { readJson } from '#api/http/request';
import { noContent } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';
import { session } from '#api/http/session';

export const routes = (app: ApiApp) =>
  session(app).post('', async ({ comments, request, user }) => {
    await comments.bulk(await readJson(request), user);
    return noContent();
  });
