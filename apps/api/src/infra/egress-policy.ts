import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import { Errors } from '#api/shared/errors';

type Address = { address: string; family: 4 | 6 };
type Resolver = (hostname: string) => Promise<Address[]>;
type Fetcher = (
  input: string | URL | Request,
  init?: BunFetchRequestInit,
) => Promise<Response>;

export type EgressAccess = 'public' | 'configured';

const blockedV4 = new BlockList();
const blockedV6 = new BlockList();

for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const)
  blockedV4.addSubnet(network, prefix, 'ipv4');

for (const [network, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['::ffff:0:0', 96],
  ['64:ff9b:1::', 48],
  ['100::', 64],
  ['2001:db8::', 32],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const)
  blockedV6.addSubnet(network, prefix, 'ipv6');

const hostnameOf = (value: string) =>
  value.startsWith('[') && value.endsWith(']') ? value.slice(1, -1) : value;

const isBlocked = ({ address, family }: Address) =>
  family === 4
    ? blockedV4.check(address.split('%')[0]!, 'ipv4')
    : blockedV6.check(address.split('%')[0]!, 'ipv6');

const systemResolver: Resolver = async (hostname) => {
  const literal = hostnameOf(hostname);
  const family = isIP(literal);
  if (family) return [{ address: literal, family } as Address];
  return (await lookup(literal, { all: true, verbatim: true })).flatMap(
    ({ address, family }) =>
      family === 4 || family === 6 ? [{ address, family } as Address] : [],
  );
};

const redirects = new Set([301, 302, 303, 307, 308]);
const MAX_REDIRECTS = 3;

/** Resolves and pins outbound connections so DNS cannot change after policy checks. */
export class EgressPolicy {
  private readonly resolver: Resolver;
  private readonly fetcher: Fetcher;

  constructor(options: { resolver?: Resolver; fetcher?: Fetcher } = {}) {
    this.resolver = options.resolver ?? systemResolver;
    this.fetcher = options.fetcher ?? fetch;
  }

  /** `configured` is the explicit private-host allowlist used by Meilisearch and SMTP settings. */
  async resolveHost(
    hostname: string,
    access: EgressAccess = 'public',
  ): Promise<Address & { serverName?: string }> {
    const host = hostnameOf(hostname);
    if (!host || host !== host.trim())
      throw new Error(Errors.OutboundUrlInvalid);
    let addresses: Address[];
    try {
      addresses = await this.resolver(host);
    } catch {
      throw new Error(Errors.OutboundHostUnresolved);
    }
    if (!addresses.length) throw new Error(Errors.OutboundHostUnresolved);
    if (access !== 'configured' && addresses.some(isBlocked))
      throw new Error(Errors.OutboundAddressBlocked);
    const chosen = addresses[0]!;
    return {
      ...chosen,
      ...(isIP(host) ? {} : { serverName: host }),
    };
  }

  async fetch(
    input: string | URL | Request,
    init: RequestInit = {},
    access: EgressAccess = 'public',
  ): Promise<Response> {
    const source = input instanceof Request ? input : null;
    const url = new URL(source?.url ?? String(input));
    const allowedPrivate =
      access === 'configured' ? hostnameOf(url.hostname) : null;
    return this.send(
      url,
      {
        method: source?.method,
        headers: source?.headers,
        body:
          source && source.method !== 'GET' && source.method !== 'HEAD'
            ? source.body
            : undefined,
        signal: source?.signal,
        redirect: source?.redirect,
        ...init,
      },
      allowedPrivate,
      0,
    );
  }

  private async send(
    url: URL,
    init: BunFetchRequestInit,
    allowedPrivate: string | null,
    followed: number,
  ): Promise<Response> {
    if (
      (url.protocol !== 'http:' && url.protocol !== 'https:') ||
      url.username ||
      url.password ||
      url.hash
    )
      throw new Error(Errors.OutboundUrlInvalid);

    const hostname = hostnameOf(url.hostname);
    const target = await this.resolveHost(
      hostname,
      hostname === allowedPrivate ? 'configured' : 'public',
    );
    const pinned = new URL(url);
    pinned.hostname =
      target.family === 6 ? `[${target.address}]` : target.address;
    const headers = new Headers(init.headers);
    headers.set('host', url.host);
    const mode = init.redirect ?? 'follow';
    const response = await this.fetcher(pinned, {
      ...init,
      headers,
      redirect: 'manual',
      ...(url.protocol === 'https:' && target.serverName
        ? { tls: { serverName: target.serverName } }
        : {}),
    });

    if (!redirects.has(response.status) || mode === 'manual') return response;
    await response.body?.cancel();
    if (mode === 'error' || followed >= MAX_REDIRECTS)
      throw new Error(Errors.OutboundRedirectBlocked);
    const location = response.headers.get('location');
    const method = init.method?.toUpperCase() ?? 'GET';
    if (!location || (method !== 'GET' && method !== 'HEAD'))
      throw new Error(Errors.OutboundRedirectBlocked);

    const next = new URL(location, url);
    const nextHeaders = new Headers(headers);
    if (next.origin !== url.origin)
      for (const name of ['authorization', 'cookie', 'proxy-authorization'])
        nextHeaders.delete(name);
    nextHeaders.delete('host');
    return this.send(
      next,
      { ...init, headers: nextHeaders, body: undefined, method },
      allowedPrivate,
      followed + 1,
    );
  }
}

export const outbound = new EgressPolicy();

export const publicFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => outbound.fetch(input, init);

/** Private addresses are allowed only because the initial hostname was explicitly configured. */
export const configuredFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => outbound.fetch(input, init, 'configured');
