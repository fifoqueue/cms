import { json } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';
import { session } from '#api/http/session';

/** Blocks of active plugins the editor can insert, with their attribute fields. */
export const routes = (app: ApiApp) =>
  session(app, 'content.create').get('', ({ pluginBlocks }) =>
    json(pluginBlocks.list()),
  );
