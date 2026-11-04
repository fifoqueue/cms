import { expect, test } from 'bun:test';
import { Elysia } from 'elysia';
import { routes } from '#api/http/routes/api/v1/i18n/messages';
import { apiErrors } from '#api/http/app';
import { withApiServices } from '#api/http/services';
import type { ApiServices } from '#api/http/services';
import { Translations } from '#api/domain/i18n/translations';
import { I18nService } from '#api/domain/i18n/service';
import { HookBus } from '#api/plugin-runtime/hook-bus';
import { profile, recordingLogger } from '#test/support/memory';

test('translation endpoint authenticates admin reads and revalidates ETags', async () => {
  const logger = recordingLogger().logger;
  const translations = new Translations();
  const hooks = new HookBus({ timeoutMs: 50, logger });
  const services = {
    i18n: new I18nService(translations, hooks),
    auth: {
      authenticate: async () => profile({ id: 'u1', role: 'contributor' }),
    },
  } as unknown as ApiServices;
  const app = new Elysia()
    .use(apiErrors(logger))
    .use(routes(withApiServices(services)));
  const request = (scope: string, headers?: HeadersInit) =>
    app.handle(
      new Request(`http://localhost/?locale=en&scope=${scope}`, { headers }),
    );
  const first = await request('site');
  const etag = first.headers.get('etag')!;

  expect(await first.json()).toEqual({ locale: 'en', messages: {} });
  expect((await request('site', { 'If-None-Match': etag })).status).toBe(304);
  expect((await request('admin')).status).toBe(401);
  expect(
    (await request('admin', { Authorization: 'Bearer contributor' })).status,
  ).toBe(200);
  translations.register('en', { site: { commentCount: '{count} replies' } });
  const changed = await request('site', { 'If-None-Match': etag });

  expect(changed.status).toBe(200);
  expect(changed.headers.get('etag')).not.toBe(etag);
  expect(await changed.json()).toEqual({
    locale: 'en',
    messages: { commentCount: '{count} replies' },
  });

  for (const [tag, locale] of [
    ['en-US', 'en'],
    ['ko-KR', 'ko'],
    ['fr-CA', 'en'],
  ]) {
    const regional = await app.handle(
      new Request(`http://localhost/?locale=${tag}&scope=site`),
    );

    expect(regional.status).toBe(200);
    expect((await regional.json()).locale).toBe(locale);
  }
});
