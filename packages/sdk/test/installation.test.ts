import { expect, test } from 'bun:test';
import { createInstallationClient } from '../src/client';
import {
  databaseSetupSchema,
  installCompleteSchema,
} from '../src/installation';

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
      return Response.json({ databaseConfigured: false, setupRequired: true });
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
