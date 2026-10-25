import { session } from '#api/http/session';
import { json } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';

export const routes = (app: ApiApp) =>
  session(app, 'users.manage').get('', ({ roles }) =>
    json(roles.capabilityDefinitions()),
  );
