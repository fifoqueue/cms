import { themePartParams } from '#api/http/params';
import { noContent } from '#api/http/respond';
import { readJson } from '#api/http/request';
import type { ApiApp } from '#api/http/services';
import { session } from '#api/http/session';

/** Site editor: a template part of a theme (`header`, `footer` …). */
export const routes = (app: ApiApp) =>
  session(app, 'appearance.manage')
    .put(
      '',
      async ({ themes, params, request }) => {
        await themes.savePart(params.id, params.slug, await readJson(request));
        return noContent();
      },
      themePartParams,
    )
    .delete(
      '',
      async ({ themes, params }) => {
        await themes.resetPart(params.id, params.slug);
        return noContent();
      },
      themePartParams,
    );
