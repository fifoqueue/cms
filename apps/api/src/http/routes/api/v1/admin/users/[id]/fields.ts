import { session } from '#api/http/session';
import { idParams } from '#api/http/params';
import { json } from '#api/http/respond';
import { readJson } from '#api/http/request';
import type { ApiApp } from '#api/http/services';

export const routes = (app: ApiApp) =>
  session(app)
    .get(
      '',
      async ({ users, user, params, set }) => {
        set.headers['cache-control'] = 'private, no-store';
        return json(await users.profileFields(params.id, user));
      },
      idParams,
    )
    .put(
      '',
      async ({ users, user, params, request, set }) => {
        set.headers['cache-control'] = 'private, no-store';
        return json(
          await users.saveProfileFields(
            params.id,
            await readJson(request),
            user,
          ),
        );
      },
      idParams,
    );
