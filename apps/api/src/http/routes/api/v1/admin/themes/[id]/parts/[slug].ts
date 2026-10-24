import { themePartParams } from '#api/http/params';
import { themeEditorHandlers } from '#api/http/theme-editor-routes';
import type { ApiApp } from '#api/http/services';
import { session } from '#api/http/session';

/** Site editor: a template part of a theme (`header`, `footer` …). */
const handlers = themeEditorHandlers<{ id: string; slug: string }>(
  ({ themes, params }, input) => themes.savePart(params.id, params.slug, input),
  ({ themes, params }) => themes.resetPart(params.id, params.slug),
);

export const routes = (app: ApiApp) =>
  session(app, 'appearance.manage')
    .put('', handlers.save, themePartParams)
    .delete('', handlers.reset, themePartParams);
