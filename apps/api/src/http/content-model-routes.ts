import { keyParams } from '#api/http/params';
import { readJson } from '#api/http/request';
import { json, noContent } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';
import { session } from '#api/http/session';

export const contentModelRoutes =
  (service: 'contentTypes' | 'fields') => (app: ApiApp) =>
    session(app)
      .put(
        '',
        async (context) =>
          json(
            await context[service].update(
              context.params.key,
              await readJson(context.request),
              context.user,
            ),
          ),
        { ...keyParams, parse: 'none' },
      )
      .delete(
        '',
        async (context) => {
          await context[service].remove(context.params.key, context.user);
          return noContent();
        },
        { ...keyParams, parse: 'none' },
      );
