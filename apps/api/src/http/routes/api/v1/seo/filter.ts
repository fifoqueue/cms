import { json } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';

/** Authenticated frontend proof and bounded input are checked before any plugin runs. */
export const routes = (app: ApiApp) =>
  app.post(
    '',
    async ({ seoFilter, request }) => json(await seoFilter.filter(request)),
    { parse: 'none' },
  );
