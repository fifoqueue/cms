import { json } from '../../respond';
import type { InstallerApp } from '../../services';

export const routes = (app: InstallerApp) =>
  app.get('', async ({ installation }) => json(await installation.status()));
