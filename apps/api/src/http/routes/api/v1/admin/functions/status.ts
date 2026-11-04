import { session } from '#api/http/session';
import { json } from '#api/http/respond';
import { forbidden } from '#api/shared/errors';
import type { ApiApp } from '#api/http/services';

export const routes = (app: ApiApp) =>
  session(app, 'functions.edit').get('', async ({ user, functionsEditor }) => {
    if (user.role !== 'administrator' || !functionsEditor) throw forbidden();

    return json(await functionsEditor.status());
  });
