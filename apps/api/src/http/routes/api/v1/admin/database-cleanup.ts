import { readJson } from '#api/http/request';
import { json } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';
import { session } from '#api/http/session';

export const routes = (app: ApiApp) =>
  session(app)
    .get('', async ({ databaseCleanup, request, user }) => {
      const keep = new URL(request.url).searchParams.get('keepLatest');

      return json(
        await databaseCleanup!.preview(
          keep === null ? {} : { keepLatest: keep === '' ? NaN : Number(keep) },
          user,
        ),
      );
    })
    .post('', async ({ databaseCleanup, request, user }) =>
      json(await databaseCleanup!.run(await readJson(request), user)),
    );
