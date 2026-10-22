import { t } from 'elysia';
import { errorResponse, json } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';
import { session } from '#api/http/session';
import { Errors } from '#api/shared/errors';

export const routes = (app: ApiApp) =>
  session(app).get(
    '',
    async ({ pluginPages, params, user }) => {
      const page = await pluginPages.render(params.pluginId, params.key, user);
      return page
        ? json(page)
        : errorResponse(502, 'plugin_error', Errors.PluginPageFailed);
    },
    { params: t.Object({ pluginId: t.String(), key: t.String() }) },
  );
