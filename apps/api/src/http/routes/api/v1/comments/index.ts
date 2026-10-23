import { COMMENT_PENDING_HEADER } from '@cms/sdk';
import { currentUser, unlockProofs } from '#api/http/request';
import { t } from 'elysia';
import { readJson, SMALL_BODY_BYTES } from '#api/http/request';
import { json } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';

/** Approved comments of a public entry, and visitors' new comments (rate limited, captcha). */
export const routes = (app: ApiApp) =>
  app
    .get(
      '',
      async ({ comments, query, auth, request, set }) => {
        set.headers['cache-control'] = 'private, no-store';
        return json(
          await comments.publicPage(
            query.contentId,
            Number(query.page ?? 1),
            unlockProofs(request),
            await currentUser(auth, request),
            request.headers.get(COMMENT_PENDING_HEADER) ?? '',
          ),
        );
      },
      {
        query: t.Object(
          { contentId: t.String(), page: t.Optional(t.String()) },
          { additionalProperties: true },
        ),
      },
    )
    .post('', async ({ comments, clients, auth, request, set }) => {
      set.headers['cache-control'] = 'private, no-store';
      return json(
        await comments.submit(
          await readJson(request, SMALL_BODY_BYTES),
          clients.attempt(request),
          unlockProofs(request),
          await currentUser(auth, request),
        ),
      );
    });
