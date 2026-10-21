import { json } from '../../../../respond';
import type { ApiApp } from '../../../../services';

export const routes = (app: ApiApp) =>
  app.get('', async ({ auth }) => json(await auth.status()));
