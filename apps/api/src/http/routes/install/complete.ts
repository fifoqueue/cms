import { readJson, SMALL_BODY_BYTES } from '#api/http/request';
import { privateJson } from '#api/http/respond';
import type { InstallerApp } from '#api/http/services';

export const routes = (app: InstallerApp) =>
  app.post('', async ({ installation, request }) =>
    privateJson(
      await installation.complete(await readJson(request, SMALL_BODY_BYTES)),
      201,
    ),
  );
