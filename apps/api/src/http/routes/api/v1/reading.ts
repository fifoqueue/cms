import { json } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';

export const routes = (app: ApiApp) =>
  app.get('', async ({ reading, publicCache }) =>
    json(
      await (publicCache?.get('reading', () => reading.getPublic()) ??
        reading.getPublic()),
    ),
  );
