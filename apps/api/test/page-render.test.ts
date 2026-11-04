import { expect, test } from 'bun:test';
import { createContentClient } from '@cms/sdk/client';
import { SLOT_NAMES } from '@cms/sdk';
import { createApiApp } from '#api/http/app';
import type { ApiServices } from '#api/http/services';
import { emptySlots } from '#api/plugin-runtime/slot-registry';

test('pageRender exposes joined slot HTML and empty rendering extensions', async () => {
  const app = await createApiApp({
    logger: { info() {}, warn() {}, error() {} },
    services: {
      slots: {
        render: async () => ({
          ...emptySlots(),
          'body.open': ['<p>first</p>', '<p>second</p>'],
        }),
      },
    } as unknown as ApiServices,
  });
  const response = await app.handle(
    new Request('http://localhost/api/v1/page-render?path=/&kind=home'),
  );
  const data = await response.json();

  expect(response.status).toBe(200);
  expect(Object.keys(data.slots).sort()).toEqual([...SLOT_NAMES].sort());
  expect(data.slots['body.open']).toBe('<p>first</p><p>second</p>');
  expect(data.bodyClasses).toEqual([]);
  expect(data.assets).toEqual([]);
  expect(data.headers).toEqual({});
  expect(data.templateCandidates).toEqual([]);
  const client = createContentClient({
    baseUrl: 'http://localhost',
    fetch: (async (input, init) =>
      app.handle(new Request(input, init))) as typeof fetch,
  });

  expect(await client.pageRender({ kind: 'home', path: '/' })).toEqual(data);
  expect(
    (
      await app.handle(
        new Request('http://localhost/api/v1/page-render?status=invalid'),
      )
    ).status,
  ).toBe(400);
});
