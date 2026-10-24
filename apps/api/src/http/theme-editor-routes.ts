import { readJson } from '#api/http/request';
import { noContent } from '#api/http/respond';
import type { ApiServices } from '#api/http/services';

type EditorContext<P> = {
  themes: ApiServices['themes'];
  params: P;
};

export const themeEditorHandlers = <P>(
  save: (context: EditorContext<P>, input: unknown) => Promise<void>,
  reset: (context: EditorContext<P>) => Promise<void>,
) => ({
  save: async ({
    themes,
    params,
    request,
  }: EditorContext<P> & { request: Request }) => {
    await save({ themes, params }, await readJson(request));
    return noContent();
  },
  reset: async ({ themes, params }: EditorContext<P>) => {
    await reset({ themes, params });
    return noContent();
  },
});
