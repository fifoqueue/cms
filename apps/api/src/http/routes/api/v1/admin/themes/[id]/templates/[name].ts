import { themeTemplateParams } from '#api/http/params';
import { themeEditorHandlers } from '#api/http/theme-editor-routes';
import type { ApiApp } from '#api/http/services';
import { session } from '#api/http/session';

/** Site editor: a template of a theme (`index`, `single`, `category-news` …). */
const handlers = themeEditorHandlers<{ id: string; name: string }>(
  ({ themes, params }, input) =>
    themes.saveTemplate(params.id, params.name, input),
  ({ themes, params }) => themes.resetTemplate(params.id, params.name),
);

export const routes = (app: ApiApp) =>
  session(app, 'appearance.manage')
    .put('', handlers.save, themeTemplateParams)
    .delete('', handlers.reset, themeTemplateParams);
