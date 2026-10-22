import { expect, test } from 'bun:test';
import { ssoCallbackSchema, ssoStartSchema } from '#sdk/auth';
import { createSsoClient } from '#sdk/client';

const ssoResponse = (input: RequestInfo | URL) => {
  const path = new URL(String(input)).pathname;
  if (path.endsWith('/start'))
    return {
      authorizationUrl: 'https://identity.example/authorize',
      transaction: 'transaction',
      expiresAt: '2026-01-01T00:00:00.000Z',
    };
  if (path.endsWith('/callback')) return { kind: 'linked' };
  if (path.endsWith('/identity')) return { identity: null, assigned: false };
  return { enabled: false, name: null };
};

test('SSO client uses the shared HTTP contract and sends the session only when given', async () => {
  const calls: {
    url: string;
    method?: string;
    authorization: string | null;
    body: unknown;
  }[] = [];
  const fetcher = (async (input, init) => {
    calls.push({
      url: String(input),
      method: init?.method,
      authorization: new Headers(init?.headers).get('authorization'),
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    return init?.method === 'DELETE'
      ? new Response(null, { status: 204 })
      : Response.json(ssoResponse(input));
  }) as typeof fetch;

  const anonymous = createSsoClient({ baseUrl: 'http://cms', fetch: fetcher });
  const signedIn = createSsoClient(
    { baseUrl: 'http://cms', fetch: fetcher },
    'session',
  );

  await anonymous.info();
  await anonymous.start();
  await anonymous.callback({ transaction: 't', query: '?code=c&state=s' });
  await signedIn.start({ intent: 'link' });
  await signedIn.identity();
  await signedIn.unlink();

  expect(calls).toEqual([
    {
      url: 'http://cms/api/v1/auth/sso',
      method: 'GET',
      authorization: null,
      body: undefined,
    },
    {
      url: 'http://cms/api/v1/auth/sso/start',
      method: 'POST',
      authorization: null,
      body: {},
    },
    {
      url: 'http://cms/api/v1/auth/sso/callback',
      method: 'POST',
      authorization: null,
      body: { transaction: 't', query: '?code=c&state=s' },
    },
    {
      url: 'http://cms/api/v1/auth/sso/start',
      method: 'POST',
      authorization: 'Bearer session',
      body: { intent: 'link' },
    },
    {
      url: 'http://cms/api/v1/auth/sso/identity',
      method: 'GET',
      authorization: 'Bearer session',
      body: undefined,
    },
    {
      url: 'http://cms/api/v1/auth/sso/identity',
      method: 'DELETE',
      authorization: 'Bearer session',
      body: undefined,
    },
  ]);

  calls.length = 0;
  const proofs: [string | null, string | null][] = [];
  const recording = (async (input, init) => {
    const headers = new Headers(init?.headers);
    proofs.push([
      headers.get('x-cms-client-address'),
      headers.get('x-cms-frontend-secret'),
    ]);
    return Response.json(ssoResponse(input));
  }) as typeof fetch;
  const frontend = createSsoClient({ baseUrl: 'http://cms', fetch: recording });
  await frontend.start({}, { address: '203.0.113.5', secret: 'shared' });
  await frontend.start({});
  await frontend.info();
  // The proof travels only with the start request it was given to.
  expect(proofs).toEqual([
    ['203.0.113.5', 'shared'],
    [null, null],
    [null, null],
  ]);

  expect(ssoStartSchema.parse({})).toEqual({ intent: 'login' });
  expect(ssoStartSchema.safeParse({ intent: 'admin' }).success).toBe(false);
  expect(
    ssoCallbackSchema.safeParse({ transaction: '', query: '' }).success,
  ).toBe(false);
});
