import { invalidInput, Errors } from '#api/shared/errors';
import { json } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';
import { session } from '#api/http/session';

/** Theme archives are small: blocks, settings and a stylesheet. */
const MAX_ARCHIVE_BYTES = 2 * 1024 * 1024;

export const routes = (app: ApiApp) =>
  session(app, 'appearance.manage')
    .get('', async ({ themes }) => json(await themes.list()))
    .post('', async ({ themes, request }) => {
      if (Number(request.headers.get('content-length')) > MAX_ARCHIVE_BYTES)
        throw invalidInput(Errors.ThemeArchiveTooLarge);
      const bytes = new Uint8Array(await request.arrayBuffer());
      if (bytes.byteLength > MAX_ARCHIVE_BYTES)
        throw invalidInput(Errors.ThemeArchiveTooLarge);

      return json(await themes.install(bytes), 201);
    });
