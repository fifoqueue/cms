import type { ApiApp } from '#api/http/services';
import { json } from '#api/http/respond';
export const routes = (app: ApiApp) =>
  app.get('', async ({ privacy }) => json(await privacy.publicSettings()));
