import { t } from 'elysia';
import { json } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';

/** The active theme, or the theme a valid `preview` token names. */
export const routes = (app: ApiApp) =>
  app.get(
    '',
    async ({ themes, themePreviews, query }) =>
      json(
        (await themePreviews.resolve(query.preview)) ??
          (await themes.getPublic()),
      ),
    {
      query: t.Object(
        { preview: t.Optional(t.String({ maxLength: 300 })) },
        { additionalProperties: true },
      ),
    },
  );
