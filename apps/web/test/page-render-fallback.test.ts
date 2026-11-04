import { expect, test } from 'bun:test';
import { createContentClient } from '@cms/sdk/client';
import { SLOT_NAMES } from '@cms/sdk';
import { loadPageRender, loadSlots } from '#lib/server/slots.js';

test('public rendering uses one page-render RPC and remains available on API failure', async () => {
  const requests: string[] = [];
  const api = createContentClient({
    baseUrl: 'http://localhost',
    fetch: (async (input: RequestInfo | URL) => {
      requests.push(String(input));

      return new Response('unavailable', { status: 503 });
    }) as typeof fetch,
  });
  const render = await loadPageRender(api, { path: '/hello', kind: 'content' });

  expect(requests).toHaveLength(1);
  expect(new URL(requests[0]!).pathname).toBe('/api/v1/page-render');
  expect(render).toEqual({
    slots: Object.fromEntries(SLOT_NAMES.map((name) => [name, ''])),
    bodyClasses: [],
    assets: [],
    headers: {},
    templateCandidates: [],
  });
  requests.length = 0;
  expect(await loadSlots(api, { path: '/' })).toEqual(
    Object.fromEntries(SLOT_NAMES.map((name) => [name, []])),
  );
  expect(requests).toHaveLength(1);
});
