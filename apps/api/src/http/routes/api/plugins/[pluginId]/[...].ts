import { pluginParams } from '#api/http/params';
import type { ApiApp } from '#api/http/services';

export const routes = (app: ApiApp) =>
  app.all(
    '',
    ({ pluginGateway, params, request }) =>
      pluginGateway.handle(params.pluginId, request),
    { ...pluginParams, parse: 'none' },
  );
