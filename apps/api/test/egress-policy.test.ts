import { describe, expect, test } from 'bun:test';
import { EgressPolicy } from '#api/infra/egress-policy';
import { Errors } from '#api/shared/errors';

describe('outbound egress policy', () => {
  test('blocks non-public IPv4, IPv6 and embedded metadata by default', async () => {
    for (const address of [
      '127.0.0.1',
      '10.0.0.1',
      '169.254.169.254',
      '::1',
      'fd00:ec2::254',
      'fec0::1',
      '2001:2::1',
      '3fff::1',
      '::ffff:127.0.0.1',
      '64:ff9b::a9fe:a9fe',
    ]) {
      const family = address.includes(':') ? 6 : 4;
      const policy = new EgressPolicy({
        resolver: async () => [{ address, family } as never],
      });
      await expect(policy.resolveHost('service.example', 443)).rejects.toThrow(
        Errors.OutboundAddressBlocked,
      );
    }
  });

  test('pins requests, retries checked GET addresses, and checks redirects', async () => {
    const calls: { url: string; init?: BunFetchRequestInit }[] = [];
    const policy = new EgressPolicy({
      resolver: async (hostname) =>
        hostname === 'private.example'
          ? [{ address: '127.0.0.1', family: 4 }]
          : [
              { address: '2001:4860:4860::8888', family: 6 },
              { address: '93.184.216.34', family: 4 },
            ],
      fetcher: async (input, init) => {
        calls.push({ url: String(input), init });
        if (String(input).includes('2001:4860')) throw new Error('unreachable');
        return new Response(null, {
          status: 302,
          headers: { location: 'https://private.example/next' },
        });
      },
    });

    await expect(
      policy.fetch('https://hooks.example:8443/start'),
    ).rejects.toThrow(Errors.OutboundAddressBlocked);
    expect(calls.map(({ url }) => url)).toEqual([
      'https://[2001:4860:4860::8888]:8443/start',
      'https://93.184.216.34:8443/start',
    ]);
    expect(new Headers(calls[1]?.init?.headers).get('host')).toBe(
      'hooks.example:8443',
    );
    expect(calls[1]?.init?.tls?.serverName).toBe('hooks.example');
  });
});
