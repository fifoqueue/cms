import { t } from 'elysia';
import { readJson, SMALL_BODY_BYTES } from '#api/http/request';
import { json } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';

/** Approved comments of a public entry, and visitors' new comments (rate limited, captcha). */
export const routes = (app: ApiApp) =>
  app
    .get(
      '',
      async ({ comments, query }) =>
        json(
          await comments.publicPage(query.contentId, Number(query.page ?? 1)),
        ),
      {
        query: t.Object(
          { contentId: t.String(), page: t.Optional(t.String()) },
          { additionalProperties: true },
        ),
      },
    )
    .post('', async ({ comments, clients, request }) =>
      json(
        await comments.submit(
          await readJson(request, SMALL_BODY_BYTES),
          clients.attempt(request),
        ),
      ),
    );
