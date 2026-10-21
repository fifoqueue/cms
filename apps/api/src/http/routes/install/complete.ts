import { readJson } from '../../request';
import { json } from '../../respond';
import type { InstallerApp } from '../../services';

export const routes = (app: InstallerApp) =>
  app.post('', async ({ installation, request }) =>
    json(await installation.complete(await readJson(request)), 201),
  );
