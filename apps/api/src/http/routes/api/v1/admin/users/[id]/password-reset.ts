import { idParams } from '#api/http/params';
import { noContent } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';
import { session } from '#api/http/session';

/** Emails the user a password reset link (`users.manage`), limited per administrator. */
export const routes = (app: ApiApp) =>
  session(app, 'users.manage').post(
    '',
    async ({ passwords, params, user }) => {
      await passwords.sendReset(params.id, user);
      return noContent();
    },
    idParams,
  );
