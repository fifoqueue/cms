import { pluginParams } from '../../../../params';
import type { ApiApp } from '../../../../services';

export const routes = (app: ApiApp) =>
  app.all(
    '',
    ({ pluginGateway, params, request }) =>
      pluginGateway.handle(params.pluginId, request),
    { ...pluginParams, parse: 'none' },
  );
