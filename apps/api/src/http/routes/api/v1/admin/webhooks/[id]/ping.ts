import { idParams } from '#api/http/params';
import { noContent } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';
import { session } from '#api/http/session';

/** Queues a `ping` delivery. */
export const routes = (app: ApiApp) =>
  session(app).post(
    '',
    async ({ webhooks, params, user }) => {
      await webhooks.ping(params.id, user);
      return noContent();
    },
    idParams,
  );
