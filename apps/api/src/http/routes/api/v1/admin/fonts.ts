import { readJson } from '#api/http/request';
import { json } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';
import { session } from '#api/http/session';

/** Site fonts for every theme's styles (Appearance → Editor → Styles). */
export const routes = (app: ApiApp) =>
  session(app, 'appearance.manage')
    .get('', async ({ themes }) => json(await themes.fonts()))
    .put('', async ({ themes, request }) =>
      json(await themes.saveFonts(await readJson(request))),
    );
