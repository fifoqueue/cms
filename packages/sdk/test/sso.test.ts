import { expect, test } from 'bun:test';
import { ssoCallbackSchema, ssoStartSchema } from '#sdk/auth';
import { createSsoClient, createAuthClient } from '#sdk/client';

const ssoResponse = (input: RequestInfo | URL) => {
  const path = new URL(String(input)).pathname;
  if (path.endsWith('/start'))
    return {
      authorizationUrl: 'https://identity.example/authorize',
      transaction: 'transaction',
      expiresAt: '2026-01-01T00:00:00.000Z',
    };
  if (path.endsWith('/callback')) return { kind: 'linked' };
  if (path.endsWith('/identity')) return { identities: [], assigned: [] };
  return { providers: [] };
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
  await anonymous.start({ provider: 'default' });
  await anonymous.callback({ transaction: 't', query: '?code=c&state=s' });
  await signedIn.start({ provider: 'default', intent: 'link' });
  await signedIn.identity();
  await signedIn.unlink('identity-1');

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
      body: { provider: 'default' },
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
      body: { provider: 'default', intent: 'link' },
    },
    {
      url: 'http://cms/api/v1/auth/sso/identity',
      method: 'GET',
      authorization: 'Bearer session',
      body: undefined,
    },
    {
      url: 'http://cms/api/v1/auth/sso/identity/identity-1',
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
  await frontend.start(
    { provider: 'default' },
    { address: '203.0.113.5', secret: 'shared' },
  );
  await frontend.start({ provider: 'default' });
  await frontend.info();
  // The proof travels only with the start request it was given to.
  expect(proofs).toEqual([
    ['203.0.113.5', 'shared'],
    [null, null],
    [null, null],
  ]);

  expect(ssoStartSchema.parse({ provider: 'default' })).toEqual({
    provider: 'default',
    intent: 'login',
  });
  expect(ssoStartSchema.safeParse({}).success).toBe(false);
  expect(
    ssoStartSchema.safeParse({ provider: 'default', intent: 'claim' }).success,
  ).toBe(false);
  expect(
    ssoStartSchema.parse({
      provider: 'default',
      intent: 'claim',
      token: 'invite',
    }),
  ).toEqual({ provider: 'default', intent: 'claim', token: 'invite' });
  expect(ssoStartSchema.safeParse({ intent: 'admin' }).success).toBe(false);
  expect(
    ssoCallbackSchema.safeParse({ transaction: '', query: '' }).success,
  ).toBe(false);
});

test('recovery client uses session routes and sends visitor proof only with recovery', async () => {
  const calls: {
    path: string;
    method: string;
    proof: string | null;
    authorization: string | null;
  }[] = [];
  const client = createAuthClient(
    {
      baseUrl: 'https://cms.example',
      fetch: (async (input, init) => {
        const path = new URL(String(input)).pathname;
        const headers = new Headers(init?.headers);
        calls.push({
          path,
          method: init!.method!,
          proof: headers.get('x-cms-client-address'),
          authorization: headers.get('authorization'),
        });
        if (init?.method === 'DELETE')
          return new Response(null, { status: 204 });
        if (path.endsWith('/recovery'))
          return Response.json({
            token: 'session',
            expiresAt: '2026-01-01T00:00:00.000Z',
            user: {
              id: 'admin',
              email: 'admin@example.com',
              name: 'Admin',
              role: 'administrator',
              slug: 'admin',
              bio: '',
              locale: '',
            },
          });
        return Response.json(
          init?.method === 'POST'
            ? { codes: ['AAAAA-BBBBB'] }
            : { remaining: 1, createdAt: null },
        );
      }) as typeof fetch,
    },
    'session',
  );
  await client.recover(
    { email: 'admin@example.com', code: 'AAAAA-BBBBB' },
    { proof: { address: '203.0.113.5', secret: 'proof' } },
  );
  await client.recoveryCodes.status();
  await client.recoveryCodes.generate();
  await client.recoveryCodes.remove();
  expect(calls.map(({ path, method }) => [path, method])).toEqual([
    ['/api/v1/auth/recovery', 'POST'],
    ['/api/v1/auth/recovery-codes', 'GET'],
    ['/api/v1/auth/recovery-codes', 'POST'],
    ['/api/v1/auth/recovery-codes', 'DELETE'],
  ]);
  expect(calls.map((call) => call.proof)).toEqual([
    '203.0.113.5',
    null,
    null,
    null,
  ]);
  expect(calls.every((call) => call.authorization === 'Bearer session')).toBe(
    true,
  );
});
