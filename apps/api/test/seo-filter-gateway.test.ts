import { expect, test } from 'bun:test';
import { discoveryFilterInputSchema } from '@cms/sdk/plugin';
import {
  SSO_CLIENT_ADDRESS_HEADER,
  SSO_FRONTEND_SECRET_HEADER,
} from '@cms/sdk';
import { ClientResolver } from '#api/http/client-identity';
import { SeoFilterGateway } from '#api/http/seo-filter-gateway';
import { MemoryRateLimiter } from '#api/infra/memory-rate-limiter';
import { JSON_BODY_BYTES } from '#api/http/request';
import { fixedClock } from '#test/support/memory';

test('discovery RPC rejects unproved, oversized and over-budget requests before filters', async () => {
  let calls = 0;
  const gateway = new SeoFilterGateway(
    new ClientResolver('secret'),
    new MemoryRateLimiter({
      clock: fixedClock(),
      perKey: 2,
      total: 2,
      windowMs: 60_000,
    }),
    {
      filterOutput: async () => {
        calls++;
        return 'filtered';
      },
    },
  );
  const request = (proof?: string, body = '{}') =>
    new Request('http://localhost/api/v1/seo/filter', {
      method: 'POST',
      headers: {
        [SSO_CLIENT_ADDRESS_HEADER]: '192.0.2.1',
        ...(proof === undefined ? {} : { [SSO_FRONTEND_SECRET_HEADER]: proof }),
      },
      body,
    });
  for (const proof of [undefined, '', 'wrong', 'secret-too-long'])
    await expect(gateway.filter(request(proof))).rejects.toMatchObject({
      code: 'forbidden',
    });
  expect(calls).toBe(0);
  await expect(
    gateway.filter(request('secret', 'x'.repeat(JSON_BODY_BYTES + 1))),
  ).rejects.toMatchObject({ code: 'payload_too_large' });
  expect(calls).toBe(0);
  expect(await gateway.filter(request('secret'))).toBe('filtered');
  await expect(gateway.filter(request('secret'))).rejects.toMatchObject({
    code: 'rate_limited',
  });
  expect(calls).toBe(1);
});

test('discovery RPC batches ordered kinds without bypassing admission', async () => {
  const gateway = new SeoFilterGateway(
    new ClientResolver('secret'),
    new MemoryRateLimiter({
      clock: fixedClock(),
      perKey: 1,
      total: 1,
      windowMs: 60_000,
    }),
    {
      filterOutput: async (input) =>
        String(discoveryFilterInputSchema.parse(input).value),
    },
  );
  const inputs = [
    { kind: 'robots.txt', value: 'robots' },
    { kind: 'llms.txt', value: 'llms' },
  ];
  const request = () =>
    new Request('http://localhost/api/v1/seo/filter', {
      method: 'POST',
      headers: {
        [SSO_CLIENT_ADDRESS_HEADER]: '192.0.2.1',
        [SSO_FRONTEND_SECRET_HEADER]: 'secret',
      },
      body: JSON.stringify(inputs),
    });
  expect(await gateway.filter(request())).toEqual(['robots', 'llms']);
  await expect(gateway.filter(request())).rejects.toMatchObject({
    code: 'rate_limited',
  });
});
