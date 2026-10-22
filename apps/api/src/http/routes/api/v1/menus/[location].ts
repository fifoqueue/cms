import { MENU_LOCATIONS } from '@cms/sdk';
import type { MenuLocation } from '@cms/sdk';
import { t } from 'elysia';
import { errorResponse, json } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';
import { Errors } from '#api/shared/errors';

export const routes = (app: ApiApp) =>
  app.get(
    '',
    async ({ menus, params }) =>
      (MENU_LOCATIONS as readonly string[]).includes(params.location)
        ? json(await menus.publicMenu(params.location as MenuLocation))
        : errorResponse(404, 'not_found', Errors.RouteNotFound),
    { params: t.Object({ location: t.String() }) },
  );
