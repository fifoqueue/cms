import { createHash } from 'node:crypto';
import { t } from 'elysia';
import { ADMIN_LOCALES } from '@cms/sdk/locales';
import { invalidInput, Errors } from '#api/shared/errors';
import { requireUser } from '#api/http/request';
import type { ApiApp } from '#api/http/services';

export const routes = (app: ApiApp) =>
  app.get(
    '',
    async ({ query, request, auth, i18n, publicCache }) => {
      const user =
        query.scope === 'admin' ? await requireUser(auth, request) : null;
      let language: string;

      try {
        language = new Intl.Locale(query.locale).language;
      } catch {
        throw invalidInput(Errors.InvalidInput);
      }

      const catalog = (ADMIN_LOCALES as readonly string[]).includes(language)
        ? language
        : 'en';
      const locale = i18n
        ? await i18n.locale(catalog, query.scope, user?.id ?? null)
        : catalog;
      const version = i18n?.version ?? '0';
      const load = async () => ({
        locale,
        messages: i18n ? await i18n.messages(locale, query.scope) : {},
      });
      const body =
        query.scope === 'site' && publicCache
          ? await publicCache.get(`i18n:${locale}:${version}`, load)
          : await load();
      const serialized = JSON.stringify(body);
      const etag = `"${createHash('sha256').update(version).update(serialized).digest('hex')}"`;
      const headers = {
        ETag: etag,
        'Cache-Control':
          query.scope === 'site'
            ? 'public, max-age=0, must-revalidate'
            : 'private, max-age=0, must-revalidate',
      };

      if (
        request.headers
          .get('if-none-match')
          ?.split(',')
          .some((value) => value.trim().replace(/^W\//, '') === etag)
      ) {
        return new Response(null, { status: 304, headers });
      }

      return new Response(serialized, {
        headers: { ...headers, 'Content-Type': 'application/json' },
      });
    },
    {
      query: t.Object({
        locale: t.String({ minLength: 1, maxLength: 100 }),
        scope: t.Union([t.Literal('site'), t.Literal('admin')]),
      }),
    },
  );
