import { expect, test } from 'bun:test';
import { createAdminClient } from '#sdk/client';

test('users and terms clients preserve core and extension query parameters', async () => {
  const urls: URL[] = [];
  const client = createAdminClient(
    {
      baseUrl: 'http://localhost:4000',
      fetch: (async (input) => {
        urls.push(new URL(String(input)));

        return Response.json([]);
      }) as typeof fetch,
    },
    'admin',
  );

  await client.users.list({ search: 'name', 'filter.example:group': 'staff' });
  await client.taxonomy.list('category', {
    search: 'term',
    hideEmpty: true,
    parentId: null,
    'filter.example:group': 'staff',
  });
  await client.users.list();
  await client.taxonomy.list('category');

  expect(Object.fromEntries(urls[0]!.searchParams)).toEqual({
    search: 'name',
    'filter.example:group': 'staff',
  });
  expect(Object.fromEntries(urls[1]!.searchParams)).toEqual({
    search: 'term',
    hideEmpty: 'true',
    parentId: 'null',
    'filter.example:group': 'staff',
  });
  expect(urls[2]!.search).toBe('');
  expect(urls[3]!.search).toBe('');
});
