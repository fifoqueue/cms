import { idParams } from '#api/http/params';
import { CONTENT_BODY_BYTES, readJson } from '#api/http/request';
import { json, noContent } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';
import { session } from '#api/http/session';

/** Trash state changes share authorization, parameter validation and a 204 response. */
export const contentTrashRoutes =
  (action: 'trash' | 'restore') => (app: ApiApp) =>
    session(app).post(
      '',
      async ({ adminContent, clients, request, params, user }) => {
        await adminContent[action](params.id, user, {
          ip: clients.address(request),
          userAgent: clients.userAgent(request),
        });
        return noContent();
      },
      { ...idParams, parse: 'none' },
    );

/** Authoring resources share the content body limit and actor-aware CRUD contract. */
export const contentRoutes =
  (service: 'adminContent' | 'patterns') => (app: ApiApp) =>
    session(app)
      .get(
        '',
        async (context) =>
          json(await context[service].get(context.params.id, context.user)),
        { ...idParams, parse: 'none' },
      )
      .put(
        '',
        async (context) =>
          json(
            service === 'adminContent'
              ? await context.adminContent.update(
                  context.params.id,
                  await readJson(context.request, CONTENT_BODY_BYTES),
                  context.user,
                  undefined,
                  {
                    ip: context.clients.address(context.request),
                    userAgent: context.clients.userAgent(context.request),
                  },
                )
              : await context.patterns.update(
                  context.params.id,
                  await readJson(context.request, CONTENT_BODY_BYTES),
                  context.user,
                ),
          ),
        { ...idParams, parse: 'none' },
      )
      .delete(
        '',
        async (context) => {
          await context[service].remove(context.params.id, context.user);
          return noContent();
        },
        { ...idParams, parse: 'none' },
      );
