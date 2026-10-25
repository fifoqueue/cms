import type { ApiApp } from '#api/http/services';
import { session } from '#api/http/session';
import { json } from '#api/http/respond';
import { authorize } from '#api/domain/auth/authorization';
import { Errors } from '#api/shared/errors';

export const routes = (app: ApiApp) =>
  session(app)
    .get('', async ({ media, user }) => {
      authorize(user, 'media.manage');
      if (!media.storageSettings.resync)
        throw new Error(Errors.MediaDriverInvalid);
      return json(await media.storageSettings.resync.status());
    })
    .post('', async ({ media, user }) => {
      authorize(user, 'media.manage');
      if (!media.storageSettings.resync)
        throw new Error(Errors.MediaDriverInvalid);
      return json(await media.storageSettings.resync.enqueue(), 202);
    });
