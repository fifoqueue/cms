import { idParams } from '#api/http/params';
import { themeEditorHandlers } from '#api/http/theme-editor-routes';
import type { ApiApp } from '#api/http/services';
import { session } from '#api/http/session';

const handlers = themeEditorHandlers<{ id: string }>(
  ({ themes, params }, input) => themes.saveStyles(params.id, input),
  ({ themes, params }) => themes.resetStyles(params.id),
);

export const routes = (app: ApiApp) =>
  session(app, 'appearance.manage')
    .put('', handlers.save, idParams)
    .delete('', handlers.reset, idParams);
