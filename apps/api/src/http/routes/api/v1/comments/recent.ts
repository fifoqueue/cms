import { t } from 'elysia';
import { json } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';

/** `?limit=`: the newest approved comments on public, unprotected entries (Latest comments). */
export const routes = (app: ApiApp) =>
  app.get(
    '',
    async ({ comments, query }) =>
      json(await comments.recent(Math.min(Math.max(query.limit ?? 5, 1), 20))),
    { query: t.Object({ limit: t.Optional(t.Numeric()) }) },
  );
