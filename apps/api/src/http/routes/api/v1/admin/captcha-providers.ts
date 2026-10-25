import { session } from '#api/http/session';
import { json } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';

export const routes = (app: ApiApp) =>
  session(app, 'settings.manage').get('', ({ security }) =>
    json(security.captchaProviders()),
  );
