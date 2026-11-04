import { session } from '#api/http/session';
import { json } from '#api/http/respond';
import { readJson } from '#api/http/request';
import { forbidden } from '#api/shared/errors';
import type { ApiApp } from '#api/http/services';

export const routes = (app: ApiApp) =>
  session(app, 'functions.edit')
    .onBeforeHandle(({ user, functionsEditor }) => {
      if (user.role !== 'administrator' || !functionsEditor) throw forbidden();
    })
    .get('', async ({ functionsEditor }) => json(await functionsEditor!.read()))
    .put('', async ({ functionsEditor, request, user }) =>
      json(await functionsEditor!.write(await readJson(request), user.id)),
    )
    .post('', async ({ functionsEditor, request }) =>
      json(await functionsEditor!.validate(await readJson(request))),
    );
