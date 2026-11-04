import { MEDIA_FILENAME_HEADER } from '@cms/sdk';
import { json } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';
import { session } from '#api/http/session';
import { readBytes } from '#api/http/request';
import { mediaListQuerySchema } from '@cms/sdk';

/** The file name travels URI-encoded in a header; the body is the raw file. */
const filenameOf = (request: Request) => {
  try {
    return decodeURIComponent(request.headers.get(MEDIA_FILENAME_HEADER) ?? '');
  } catch {
    return '';
  }
};

let uploads: Promise<unknown> = Promise.resolve();
const upload = <T>(task: () => Promise<T>) => {
  const run = uploads.then(task, task);

  uploads = run.catch(() => undefined);

  return run;
};

export const routes = (app: ApiApp) =>
  session(app)
    .get('', async ({ media, adminUi, query, user }) =>
      json(
        await media.list(
          adminUi
            ? await adminUi.apply(user, 'media', query, mediaListQuerySchema)
            : query,
          user,
        ),
      ),
    )
    .post(
      '',
      async ({ media, request, user }) =>
        upload(async () =>
          json(
            await media.upload(
              await readBytes(request, media.maxBytes),
              filenameOf(request),
              user,
            ),
            201,
          ),
        ),
      { parse: 'none' },
    );
