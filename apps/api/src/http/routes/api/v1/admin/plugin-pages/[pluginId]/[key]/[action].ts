import { t } from 'elysia';
import { readJson } from '#api/http/request';
import { errorResponse, json } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';
import { session } from '#api/http/session';
import { Errors } from '#api/shared/errors';

/** Runs a form action of a plugin admin page with the submitted values. */
export const routes = (app: ApiApp) =>
  session(app).post(
    '',
    async ({ pluginPages, params, request, user }) => {
      const result = await pluginPages.run(
        params.pluginId,
        params.key,
        params.action,
        await readJson(request),
        user,
      );
      return result
        ? json(result)
        : errorResponse(502, 'plugin_error', Errors.PluginPageFailed);
    },
    {
      params: t.Object({
        pluginId: t.String(),
        key: t.String(),
        action: t.String(),
      }),
    },
  );
