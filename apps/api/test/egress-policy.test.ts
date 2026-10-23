import { describe, expect, test } from 'bun:test';
import { EgressPolicy } from '#api/infra/egress-policy';
import { Errors } from '#api/shared/errors';

describe('outbound egress policy', () => {
  test('blocks every private address returned by DNS, including mapped IPv6', async () => {
    for (const address of [
      '127.0.0.1',
      '10.0.0.1',
      '169.254.169.254',
      '::1',
      'fe80::1',
      'fd00:ec2::254',
      '::ffff:127.0.0.1',
    ]) {
      const family = address.includes(':') ? 6 : 4;
      const policy = new EgressPolicy({
        resolver: async () => [{ address, family } as never],
      });
      await expect(policy.resolveHost('service.example')).rejects.toThrow(
        Errors.OutboundAddressBlocked,
      );
    }
  });

  test('pins public HTTP requests and rechecks redirect destinations', async () => {
    const calls: { url: string; init?: BunFetchRequestInit }[] = [];
    const policy = new EgressPolicy({
      resolver: async (hostname) => [
        hostname === 'private.example'
          ? { address: '127.0.0.1', family: 4 }
          : { address: '93.184.216.34', family: 4 },
      ],
      fetcher: async (input, init) => {
        calls.push({ url: String(input), init });
        return new Response(null, {
          status: 302,
          headers: { location: 'https://private.example/next' },
        });
      },
    });

    await expect(
      policy.fetch('https://hooks.example:8443/start'),
    ).rejects.toThrow(Errors.OutboundAddressBlocked);
    expect(calls[0]?.url).toBe('https://93.184.216.34:8443/start');
    expect(new Headers(calls[0]?.init?.headers).get('host')).toBe(
      'hooks.example:8443',
    );
    expect(calls[0]?.init?.tls?.serverName).toBe('hooks.example');
  });

  test('an explicitly configured service may use its exact local hostname', async () => {
    const policy = new EgressPolicy({
      resolver: async () => [{ address: '127.0.0.1', family: 4 }],
    });

    expect(await policy.resolveHost('localhost', 'configured')).toEqual({
      address: '127.0.0.1',
      family: 4,
      serverName: 'localhost',
    });
  });
});
