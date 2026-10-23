import { keyParams } from '#api/http/params';
import { noContent } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';
import { session } from '#api/http/session';

/** Deletes a custom role; `?reassignTo=<role>` names the role its users get first. */
export const routes = (app: ApiApp) =>
  session(app, 'users.manage').delete(
    '',
    async ({ roles, params, query, user }) => {
      await roles.remove(params.key, query, user);
      return noContent();
    },
    keyParams,
  );
