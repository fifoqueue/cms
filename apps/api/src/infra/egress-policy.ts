import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import type { EgressRule, EgressService } from '@cms/sdk';
import { destinationBlocked, invalidInput, Errors } from '#api/shared/errors';
import {
  inRange,
  parseAddress,
  type ParsedAddress,
} from '#api/shared/ip-address';

export type Address = { address: string; family: 4 | 6 };
type Resolver = (hostname: string) => Promise<Address[]>;
type Fetcher = (
  input: string | URL | Request,
  init?: BunFetchRequestInit,
) => Promise<Response>;

export interface EgressAccess {
  service?: EgressService;
  rules?: readonly EgressRule[];
  signal?: AbortSignal;
  timeoutMs?: number;
}

const V4_PRIVATE = [
  '10.0.0.0/8',
  '100.64.0.0/10',
  '127.0.0.0/8',
  '169.254.0.0/16',
  '172.16.0.0/12',
  '192.168.0.0/16',
] as const;

const V4_FORBIDDEN = [
  '0.0.0.0/8',
  '100.100.100.200/32',
  '168.63.129.16/32',
  '169.254.169.0/24',
  '169.254.170.2/32',
  '192.0.0.0/24',
  '192.0.2.0/24',
  '192.88.99.0/24',
  '198.18.0.0/15',
  '198.51.100.0/24',
  '203.0.113.0/24',
  '224.0.0.0/4',
  '240.0.0.0/4',
] as const;

const V6_PRIVATE = ['::1/128', 'fc00::/7', 'fe80::/10', 'fec0::/10'] as const;
const V6_FORBIDDEN = [
  '::/128',
  '64:ff9b:1::/48',
  '100::/64',
  '2001::/23',
  '2001:2::/48',
  '2001:db8::/32',
  '3fff::/20',
  '5f00::/16',
  'fd00:ec2::254/128',
  'fe80::a9fe:a9fe/128',
  'ff00::/8',
] as const;

type AddressClass = 'public' | 'private' | 'forbidden';

const classifyV4 = (address: ParsedAddress): AddressClass => {
  if (V4_FORBIDDEN.some((range) => inRange(address, range))) return 'forbidden';
  if (V4_PRIVATE.some((range) => inRange(address, range))) return 'private';
  return 'public';
};

const embeddedV4 = (address: ParsedAddress) => {
  if (address.family !== 6) return null;
  const mapped = inRange(address, '::ffff:0:0/96');
  const nat64 = inRange(address, '64:ff9b::/96');
  const sixToFour = inRange(address, '2002::/16');
  if (!mapped && !nat64 && !sixToFour) return null;
  const value = sixToFour
    ? (address.value >> 80n) & 0xffff_ffffn
    : address.value & 0xffff_ffffn;
  return { family: 4 as const, value };
};

const classify = (value: Address): AddressClass => {
  const address = parseAddress(value.address);
  if (!address) return 'forbidden';
  if (address.family === 4) return classifyV4(address);
  const embedded = embeddedV4(address);
  if (embedded) return classifyV4(embedded);
  if (V6_FORBIDDEN.some((range) => inRange(address, range))) return 'forbidden';
  if (V6_PRIVATE.some((range) => inRange(address, range))) return 'private';
  return 'public';
};

const hostnameOf = (value: string) =>
  (value.startsWith('[') && value.endsWith(']') ? value.slice(1, -1) : value)
    .toLowerCase()
    .replace(/\.$/, '');

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
const DEFAULT_TIMEOUT_MS = 10_000;

const operationSignal = (
  signal?: AbortSignal,
  timeoutMs = DEFAULT_TIMEOUT_MS,
) => {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
};

const abortable = async <T>(task: Promise<T>, signal: AbortSignal) => {
  if (signal.aborted) throw signal.reason;
  let stop: () => void = () => undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    const listener = () => reject(signal.reason);
    signal.addEventListener('abort', listener, { once: true });
    stop = () => signal.removeEventListener('abort', listener);
  });
  try {
    return await Promise.race([task, aborted]);
  } finally {
    stop();
  }
};

const portOf = (url: URL) =>
  url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80;

const ruleAllows = (
  address: Address,
  host: string,
  port: number,
  access: EgressAccess,
) => {
  const parsed = parseAddress(address.address);
  return (
    !!parsed &&
    !!access.service &&
    access.rules?.some(
      (rule) =>
        rule.service === access.service &&
        hostnameOf(rule.host) === host &&
        rule.port === port &&
        rule.addresses.some((range) => inRange(parsed, range)),
    )
  );
};

const connectionFailure = (error: unknown) => {
  const candidate =
    error instanceof Error && error.cause instanceof Error
      ? error.cause
      : error;
  const code =
    candidate && typeof candidate === 'object' && 'code' in candidate
      ? String(candidate.code)
      : '';
  return ['ECONNREFUSED', 'ENETUNREACH', 'EHOSTUNREACH'].includes(code);
};

/** Resolves and pins outbound connections so DNS cannot change after policy checks. */
export class EgressPolicy {
  private readonly resolver: Resolver;
  private readonly fetcher: Fetcher;

  constructor(options: { resolver?: Resolver; fetcher?: Fetcher } = {}) {
    this.resolver = options.resolver ?? systemResolver;
    this.fetcher = options.fetcher ?? fetch;
  }

  async resolveHost(
    hostname: string,
    port: number,
    access: EgressAccess = {},
  ): Promise<(Address & { serverName?: string })[]> {
    const host = hostnameOf(hostname);
    if (!host || host !== host.trim() || port < 1 || port > 65_535)
      throw invalidInput(Errors.OutboundUrlInvalid);
    const signal =
      access.signal ?? operationSignal(undefined, access.timeoutMs);
    let addresses: Address[];
    try {
      addresses = await abortable(this.resolver(host), signal);
    } catch {
      if (signal.aborted) throw signal.reason;
      throw invalidInput(Errors.OutboundHostUnresolved);
    }
    if (!addresses.length) throw invalidInput(Errors.OutboundHostUnresolved);
    for (const address of addresses) {
      const kind = classify(address);
      if (
        kind === 'forbidden' ||
        (kind === 'private' && !ruleAllows(address, host, port, access))
      )
        throw destinationBlocked();
    }
    const serverName = isIP(host) ? undefined : host;
    return addresses.map((address) => ({
      ...address,
      ...(serverName && { serverName }),
    }));
  }

  /** Resolves a URL without sending data. Used when an administrator saves a destination. */
  async check(input: string | URL, access: EgressAccess = {}) {
    const url = this.url(input);
    const signal = operationSignal(access.signal, access.timeoutMs);
    await this.resolveHost(url.hostname, portOf(url), { ...access, signal });
  }

  /** Exact private addresses for one-time migration of an existing configured destination. */
  async compatibilityRule(
    service: EgressService,
    hostname: string,
    port: number,
  ): Promise<EgressRule | null> {
    const host = hostnameOf(hostname);
    const signal = operationSignal();
    let addresses: Address[];
    try {
      addresses = await abortable(this.resolver(host), signal);
    } catch {
      return null;
    }
    if (addresses.some((address) => classify(address) === 'forbidden'))
      return null;
    const privateAddresses = addresses
      .filter((address) => classify(address) === 'private')
      .map(({ address }) => address.split('%')[0]!);
    return privateAddresses.length
      ? { service, host, port, addresses: [...new Set(privateAddresses)] }
      : null;
  }

  async fetch(
    input: string | URL | Request,
    init: RequestInit = {},
    access: EgressAccess = {},
  ): Promise<Response> {
    const source = input instanceof Request ? input : null;
    const url = this.url(input instanceof Request ? input.url : input);
    const signals = [init.signal, source?.signal, access.signal].filter(
      (signal): signal is AbortSignal => !!signal,
    );
    const sourceSignal = signals.length ? AbortSignal.any(signals) : undefined;
    const signal = operationSignal(sourceSignal, access.timeoutMs);
    return this.send(
      url,
      {
        method: source?.method,
        headers: source?.headers,
        body:
          source && source.method !== 'GET' && source.method !== 'HEAD'
            ? source.body
            : undefined,
        redirect: source?.redirect,
        ...init,
        signal,
      },
      { ...access, signal },
      0,
    );
  }

  private url(input: string | URL) {
    const url = new URL(String(input));
    if (
      (url.protocol !== 'http:' && url.protocol !== 'https:') ||
      url.username ||
      url.password ||
      url.hash
    )
      throw invalidInput(Errors.OutboundUrlInvalid);
    return url;
  }

  private async send(
    url: URL,
    init: BunFetchRequestInit,
    access: EgressAccess,
    followed: number,
  ): Promise<Response> {
    const hostname = hostnameOf(url.hostname);
    const targets = await this.resolveHost(hostname, portOf(url), access);
    const method = init.method?.toUpperCase() ?? 'GET';
    let response: Response | undefined;
    let failure: unknown;

    for (const [index, target] of targets.entries()) {
      const pinned = new URL(url);
      pinned.hostname =
        target.family === 6 ? `[${target.address}]` : target.address;
      const headers = new Headers(init.headers);
      headers.set('host', url.host);
      try {
        response = await this.fetcher(pinned, {
          ...init,
          headers,
          redirect: 'manual',
          ...(url.protocol === 'https:' && target.serverName
            ? { tls: { serverName: target.serverName } }
            : {}),
        });
        break;
      } catch (error) {
        failure = error;
        if (
          access.signal?.aborted ||
          (method !== 'GET' &&
            method !== 'HEAD' &&
            !connectionFailure(error)) ||
          index === targets.length - 1
        )
          throw error;
      }
    }
    if (!response) throw failure;

    const mode = init.redirect ?? 'follow';
    if (!redirects.has(response.status) || mode === 'manual') return response;
    await response.body?.cancel();
    if (mode === 'error' || followed >= MAX_REDIRECTS)
      throw new Error(Errors.OutboundRedirectBlocked);
    const location = response.headers.get('location');
    if (!location || (method !== 'GET' && method !== 'HEAD'))
      throw new Error(Errors.OutboundRedirectBlocked);

    const next = this.url(new URL(location, url));
    const nextHeaders = new Headers(init.headers);
    if (next.origin !== url.origin)
      for (const name of ['authorization', 'cookie', 'proxy-authorization'])
        nextHeaders.delete(name);
    nextHeaders.delete('host');
    return this.send(
      next,
      { ...init, headers: nextHeaders, body: undefined, method },
      access,
      followed + 1,
    );
  }
}

export const outbound = new EgressPolicy();

export const publicFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => outbound.fetch(input, init);
