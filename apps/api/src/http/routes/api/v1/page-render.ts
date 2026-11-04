import { json } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';
import { PageRenderService } from '#api/plugin-runtime/page-render-service';

export const routes = (app: ApiApp) => {
  let service: PageRenderService;

  return app.get(
    '',
    async ({ query, request, slots, renderHooks, themes, assets }) => {
      service ??= new PageRenderService(slots, renderHooks, themes, assets);

      return json(await service.render(query, request));
    },
  );
};
