import { themeTemplateParams } from '#api/http/params';
import { noContent } from '#api/http/respond';
import { readJson } from '#api/http/request';
import type { ApiApp } from '#api/http/services';
import { session } from '#api/http/session';

/** Site editor: a template of a theme (`index`, `single`, `category-news` …). */
export const routes = (app: ApiApp) =>
  session(app, 'appearance.manage')
    .put(
      '',
      async ({ themes, params, request }) => {
        await themes.saveTemplate(
          params.id,
          params.name,
          await readJson(request),
        );
        return noContent();
      },
      themeTemplateParams,
    )
    .delete(
      '',
      async ({ themes, params }) => {
        await themes.resetTemplate(params.id, params.name);
        return noContent();
      },
      themeTemplateParams,
    );
