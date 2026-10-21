import { describe, expect, test } from 'bun:test';
import {
  SsoClientResolver,
  UNVERIFIED_CLIENT,
  clientNetwork,
} from '../src/http/sso-client';

describe('clientNetwork', () => {
  test.each([
    ['203.0.113.5', '203.0.113.5'],
    ['::ffff:203.0.113.5', '203.0.113.5'],
    ['2001:db8:1:2:3:4:5:6', '2001:db8:1:2::/64'],
    ['2001:0DB8:0001:0002::9', '2001:db8:1:2::/64'],
    ['2001:db8::1', '2001:db8:0:0::/64'],
    ['::1', '0:0:0:0::/64'],
    ['fe80::1%eth0', 'fe80:0:0:0::/64'],
    ['64:ff9b::192.0.2.1', '64:ff9b:0:0::/64'],
  ])('%s is counted as %s', (address, network) => {
    expect(clientNetwork(address)).toBe(network);
  });

  test.each([
    '',
    'localhost',
    '203.0.113',
    '2001:db8::1::2',
    '::ffff:999.1.1.1',
  ])('rejects %p', (address) => {
    expect(clientNetwork(address)).toBeNull();
  });
});

describe('SsoClientResolver', () => {
  const secret = 'x'.repeat(40);
  const request = (headers: Record<string, string>) =>
    new Request('http://localhost/api/v1/auth/sso/start', {
      method: 'POST',
      headers,
    });

  test('trusts the address only with the frontend secret', () => {
    const resolver = new SsoClientResolver(secret);

    expect(
      resolver.resolve(
        request({
          'x-cms-client-address': '203.0.113.5',
          'x-cms-frontend-secret': secret,
        }),
      ),
    ).toBe('ip:203.0.113.5');

    for (const headers of [
      {} as Record<string, string>,
      { 'x-cms-client-address': '203.0.113.5' },
      { 'x-cms-client-address': '203.0.113.5', 'x-cms-frontend-secret': 'y' },
      { 'x-cms-frontend-secret': secret },
      { 'x-cms-client-address': 'not-an-ip', 'x-cms-frontend-secret': secret },
    ])
      expect(resolver.resolve(request(headers))).toBe(UNVERIFIED_CLIENT);
  });

  test('without a configured secret nobody can claim an address', () => {
    expect(
      new SsoClientResolver(undefined).resolve(
        request({
          'x-cms-client-address': '203.0.113.5',
          'x-cms-frontend-secret': '',
        }),
      ),
    ).toBe(UNVERIFIED_CLIENT);
  });
});
