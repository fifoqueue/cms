import { idParams } from '#api/http/params';
import { CONTENT_BODY_BYTES, readJson } from '#api/http/request';
import { json, noContent } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';
import { session } from '#api/http/session';

export const routes = (app: ApiApp) =>
  session(app)
    // The user's autosave when it is newer than the saved entry; 204 otherwise.
    .get(
      '',
      async ({ contentRevisions, params, user }) => {
        const autosave = await contentRevisions.pendingAutosave(
          params.id,
          user,
        );
        return autosave ? json(autosave) : noContent();
      },
      idParams,
    )
    .put(
      '',
      async ({ contentRevisions, clients, params, request, user }) => {
        await contentRevisions.autosave(
          params.id,
          await readJson(request, CONTENT_BODY_BYTES),
          user,
          {
            ip: clients.address(request),
            userAgent: clients.userAgent(request),
          },
        );
        return noContent();
      },
      idParams,
    );
