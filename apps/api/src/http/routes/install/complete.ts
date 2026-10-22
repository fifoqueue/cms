import { readJson, SMALL_BODY_BYTES } from '#api/http/request';
import { json } from '#api/http/respond';
import type { InstallerApp } from '#api/http/services';

export const routes = (app: InstallerApp) =>
  app.post('', async ({ installation, request }) =>
    json(
      await installation.complete(await readJson(request, SMALL_BODY_BYTES)),
      201,
    ),
  );
