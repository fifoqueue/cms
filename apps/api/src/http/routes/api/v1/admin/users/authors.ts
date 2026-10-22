import { json } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';
import { session } from '#api/http/session';

/** Names for the author picker: editors assign entries to other users. */
export const routes = (app: ApiApp) =>
  session(app, 'content.editOthers').get('', async ({ users }) =>
    json(await users.authors()),
  );
