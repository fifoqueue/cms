import type { ApiApp } from '#api/http/services';
import { session } from '#api/http/session';
import { json } from '#api/http/respond';
import { readJson, SMALL_BODY_BYTES } from '#api/http/request';
import { notFound, Errors } from '#api/shared/errors';
import { t } from 'elysia';

export const routes = (app: ApiApp) =>
  session(app).post(
    '',
    async ({ adminUi, renderHooks, user, params, request }) => {
      if (!adminUi) throw notFound(Errors.PluginPageNotFound);

      return json(
        await adminUi.action(
          user,
          params.screen,
          params.key,
          await readJson(request, SMALL_BODY_BYTES),
          renderHooks,
        ),
      );
    },
    {
      parse: 'none',
      params: t.Object({ screen: t.String(), key: t.String() }),
    },
  );
