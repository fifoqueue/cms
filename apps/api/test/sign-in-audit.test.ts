import { expect, test } from 'bun:test';
import { createSsoMethod } from '#api/domain/auth/sso-method';
import { ClientResolver } from '#api/http/client-identity';
import { MemoryRateLimiter } from '#api/infra/memory-rate-limiter';
import { fixedClock } from '#test/support/memory';
import { createMemoryAuthStore } from '#test/support/sso-memory';

test('SSO start admission uses the proved network key, grouping IPv6 /64 and unproved clients', async () => {
  const secret = 'frontend-secret';
  const clients = new ClientResolver(secret);
  const clock = fixedClock();
  const limiter = new MemoryRateLimiter({
    clock,
    perKey: 1,
    total: 20,
    windowMs: 60000,
  });
  const { identities } = createMemoryAuthStore();
  const keys: string[] = [];
  const method = createSsoMethod({
    setup: async () => ({
      providers: [
        {
          id: 'provider',
          name: 'Provider',
          issuer: 'https://id.example',
          subjects: new Map(),
          provider: {
            authorize: async () => ({
              url: 'https://id.example/auth',
              state: 'state',
              nonce: 'nonce',
              codeVerifier: 'verifier',
            }),
            verify: async () => ({
              issuer: 'https://id.example',
              subject: 'subject',
            }),
          },
        },
      ],
    }),
    identities,
    resolve: async () => null,
    ids: { next: () => 'id' },
    clock,
    starts: {
      tryAcquire: (key) => {
        keys.push(key);
        return limiter.tryAcquire(key);
      },
    },
  });
  const start = (address: string, proof = secret) =>
    method.begin({
      ...clients.attempt(
        new Request('http://localhost/', {
          headers: {
            'x-cms-client-address': address,
            'x-cms-frontend-secret': proof,
          },
        }),
      ),
      option: 'provider',
      values: {},
      callbackUrl: 'https://site.example/admin/sign-in/callback',
    });
  expect((await start('2001:db8:1:2::1')).kind).toBe('redirect');
  await expect(start('2001:db8:1:2::99')).rejects.toMatchObject({
    code: 'rate_limited',
  });
  expect((await start('2001:db8:1:3::1')).kind).toBe('redirect');
  expect((await start('203.0.113.1', 'forged')).kind).toBe('redirect');
  await expect(start('203.0.113.2', 'forged')).rejects.toMatchObject({
    code: 'rate_limited',
  });
  expect(keys[0]).toBe(keys[1]);
  expect(keys[3]).toBe(keys[4]);
});
