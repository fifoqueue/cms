import { expect, test } from 'bun:test';
import { createContentClient } from '#sdk/client';
import {
  SSO_CLIENT_ADDRESS_HEADER,
  SSO_FRONTEND_SECRET_HEADER,
} from '#sdk/auth';

test('discovery client sends proof and validates ordered batch results', async () => {
  const proof = { address: '192.0.2.1', secret: 'server-secret' };
  const client = createContentClient({
    baseUrl: 'http://localhost',
    fetch: (async (_url, init) => {
      const headers = new Headers(init?.headers);
      expect(headers.get(SSO_CLIENT_ADDRESS_HEADER)).toBe(proof.address);
      expect(headers.get(SSO_FRONTEND_SECRET_HEADER)).toBe(proof.secret);
      expect(JSON.parse(String(init?.body))).toEqual([
        { kind: 'robots.txt', value: 'original' },
      ]);
      return Response.json(['filtered']);
    }) as typeof fetch,
  });
  expect(
    await client.seo.filterBatch(
      [{ kind: 'robots.txt', value: 'original' }],
      proof,
    ),
  ).toEqual(['filtered']);
});
