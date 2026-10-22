import { json } from '#api/http/respond';
import type { InstallerApp } from '#api/http/services';

export const routes = (app: InstallerApp) =>
  app.get('', async ({ installation }) => json(await installation.status()));
