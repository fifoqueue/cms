import { idParams } from '#api/http/params';
import { readJson } from '#api/http/request';
import { noContent } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';
import { session } from '#api/http/session';

/** Changes only the user's role (`users.manage`); profile fields stay as stored. */
export const routes = (app: ApiApp) =>
  session(app, 'users.manage').put(
    '',
    async ({ users, params, request, user }) => {
      await users.setRole(params.id, await readJson(request), user);
      return noContent();
    },
    idParams,
  );
