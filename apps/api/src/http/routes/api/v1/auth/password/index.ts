import { bearerToken, readJson } from '#api/http/request';
import { noContent } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';
import { session } from '#api/http/session';

/** Changes the signed-in user's password; their other sessions end. */
export const routes = (app: ApiApp) =>
  session(app).put('', async ({ passwords, request, user }) => {
    await passwords.change(
      await readJson(request),
      user,
      bearerToken(request)!,
    );
    return noContent();
  });
