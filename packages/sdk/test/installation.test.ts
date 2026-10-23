import { expect, test } from 'bun:test';
import { createInstallationClient } from '#sdk/client';
import { databaseSetupSchema, installCompleteSchema } from '#sdk/installation';
import { DEFAULT_SITE_SETTINGS, siteSettingsSchema } from '#sdk/site';

test('installation client uses the shared HTTP contract', async () => {
  const calls: { url: string; method?: string; body: unknown }[] = [];
  const client = createInstallationClient({
    baseUrl: 'http://cms',
    fetch: (async (input, init) => {
      calls.push({
        url: String(input),
        method: init?.method,
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      });
      return Response.json(
        String(input).endsWith('/complete')
          ? {
              token: 'session',
              expiresAt: '2026-01-01T00:00:00.000Z',
              user: {
                id: '1',
                email: 'admin@example.com',
                name: '관리자',
                role: 'administrator',
                slug: 'admin',
                bio: '',
                locale: '',
              },
            }
          : { databaseConfigured: false, setupRequired: true },
      );
    }) as typeof fetch,
  });
  const database = {
    token: 'key',
    host: 'localhost',
    database: 'cms',
    username: 'cms',
    password: '',
  };
  const complete = {
    token: 'key',
    siteUrl: 'https://cms.example.com',
    admin: {
      name: '관리자',
      email: 'admin@example.com',
      password: 'long-password',
    },
    site: { title: '사이트', description: '', locale: 'ko' },
  };
  await client.status();
  await client.database(database);
  await client.complete(complete);
  expect(calls).toEqual([
    { url: 'http://cms/api/v1/install/status', method: 'GET', body: undefined },
    {
      url: 'http://cms/api/v1/install/database',
      method: 'POST',
      body: database,
    },
    {
      url: 'http://cms/api/v1/install/complete',
      method: 'POST',
      body: complete,
    },
  ]);
  expect(databaseSetupSchema.parse(database).port).toBe(3306);
  expect(installCompleteSchema.safeParse(complete).success).toBe(true);
  expect(
    installCompleteSchema.safeParse({ ...complete, token: '' }).success,
  ).toBe(false);
});

test('public login paths stay canonical and outside system routes', () => {
  expect(
    siteSettingsSchema.safeParse({
      ...DEFAULT_SITE_SETTINGS,
      loginPath: '/members/sign-in',
    }).success,
  ).toBe(true);
  for (const loginPath of [
    '//outside.example',
    '/admin/login',
    '/avatars/person',
    '/feed.xml',
    '/privacy/confirm',
    '/login/',
  ])
    expect(
      siteSettingsSchema.safeParse({ ...DEFAULT_SITE_SETTINGS, loginPath })
        .success,
    ).toBe(false);
});
