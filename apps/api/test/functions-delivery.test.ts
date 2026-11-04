import { expect, test } from 'bun:test';
import { Elysia } from 'elysia';
import { SSO_FRONTEND_SECRET_HEADER } from '@cms/sdk';
import { routes } from '#api/http/routes/api/v1/internal/functions';
import type { ApiApp } from '#api/http/services';

test('functions delivery authenticates before reading source or returning 304', async () => {
  let reads = 0;
  const app = routes(
    new Elysia().decorate({
      frontendSecret: 'paired-secret',
      functionsDirectory: undefined,
      themes: {
        activeFunctions: async () => {
          reads++;

          return {
            owner: 'theme:example',
            text: 'export const functions = {};',
          };
        },
      },
    }) as unknown as ApiApp,
  );
  const request = (headers: Record<string, string> = {}) =>
    app.handle(new Request('http://localhost/', { headers }));
  const denied = await request();

  expect(denied.ok).toBe(false);
  expect(reads).toBe(0);
  const accepted = await request({
    [SSO_FRONTEND_SECRET_HEADER]: 'paired-secret',
  });
  const body = await accepted.json();

  expect(accepted.status).toBe(200);
  expect(body.sources).toEqual([
    {
      owner: 'theme:example',
      hash: expect.stringMatching(/^[a-f0-9]{64}$/),
      code: 'export const functions = {};',
    },
  ]);
  expect(accepted.headers.get('etag')).toBe(`"${body.version}"`);
  expect(accepted.headers.get('cache-control')).toBe('private, no-store');
  const etag = accepted.headers.get('etag')!;
  const unchanged = await request({
    [SSO_FRONTEND_SECRET_HEADER]: 'paired-secret',
    'if-none-match': etag,
  });

  expect(unchanged.status).toBe(304);
  expect(await unchanged.text()).toBe('');
  const before = reads;
  const forged = await request({
    [SSO_FRONTEND_SECRET_HEADER]: 'wrong-secret',
    'if-none-match': etag,
  });

  expect(forged.ok).toBe(false);
  expect(reads).toBe(before);
});
