import { expect, test } from 'bun:test';
import { createAdminClient } from '#sdk/client';
import { roleDefinitionSchema } from '#sdk/roles';

test('extension clients preserve contribution and capability ownership', async () => {
  const client = createAdminClient(
    {
      baseUrl: 'http://localhost',
      fetch: (async (url) =>
        Response.json(
          String(url).endsWith('/contributions')
            ? [{ key: 'examples', source: 'test-plugin', patterns: [] }]
            : [
                {
                  key: 'example.read',
                  label: 'Read examples',
                  source: 'test-plugin',
                },
              ],
        )) as typeof fetch,
    },
    'token',
  );
  expect(await client.patterns.contributions()).toEqual([
    { key: 'examples', source: 'test-plugin', patterns: [] },
  ]);
  expect(await client.roles.capabilities()).toEqual([
    { key: 'example.read', label: 'Read examples', source: 'test-plugin' },
  ]);
  expect(
    roleDefinitionSchema.parse({
      key: 'staff',
      name: 'Staff',
      capabilities: [],
      source: 'test-plugin',
    }).source,
  ).toBe('test-plugin');
});
