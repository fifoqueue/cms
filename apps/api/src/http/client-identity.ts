import { createHash, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import {
  CAPTCHA_TOKEN_HEADER,
  CLIENT_USER_AGENT_HEADER,
  SSO_CLIENT_ADDRESS_HEADER,
  SSO_FRONTEND_SECRET_HEADER,
} from '@cms/sdk';
import { cleanUserAgent } from '#api/shared/user-agent';

/** Client of every request that cannot prove which browser it acts for. They share one quota. */
export const UNVERIFIED_CLIENT = 'unverified';

const digest = (value: string) => createHash('sha256').update(value).digest();

const MAPPED_IPV4 = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i;

/** The first four groups of a valid IPv6 address, expanded and normalized. */
const ipv6Prefix = (address: string) => {
  const [head, tail] = address.split('::');
  const groups = (part: string | undefined) =>
    part
      ? part
          .split(':')
          .flatMap((group) => (group.includes('.') ? ['0', '0'] : [group]))
      : [];
  const left = groups(head);
  const right = groups(tail);
  const all =
    tail === undefined
      ? left
      : [...left, ...Array(8 - left.length - right.length).fill('0'), ...right];

  return all.slice(0, 4).map((group) => parseInt(group, 16).toString(16));
};

/**
 * The network a client is counted by: an IPv4 address, or the /64 an IPv6 address belongs to
 * (the smallest block a single subscriber is normally given). `null` when `address` is not an IP.
 */
export const clientNetwork = (address: string): string | null => {
  const host = address.split('%')[0] ?? '';
  const mapped = MAPPED_IPV4.exec(host)?.[1];

  if (mapped && isIP(mapped) === 4) return mapped;

  switch (isIP(host)) {
    case 4:
      return host;
    case 6:
      return `${ipv6Prefix(host).join(':')}::/64`;
    default:
      return null;
  }
};

/**
 * Decides which client a request acts for (sign-in, password reset, comments, single sign-on).
 * The API only ever sees the web server, so the browser's address is taken from the web
 * server's assertion, and only when the request carries the shared frontend secret. Anything
 * else, including forged headers, is the shared `UNVERIFIED_CLIENT`.
 */
export class ClientResolver {
  private readonly secret: Buffer | null;

  constructor(secret: string | undefined) {
    this.secret = secret ? digest(secret) : null;
  }

  /** Whether this process has seen the web server prove a visitor (for site health). */
  proven = false;

  /** Whether a frontend secret is configured at all. */
  get verifying() {
    return this.secret !== null;
  }

  /** Whether the request carries the frontend secret, so its client headers are the web server's. */
  private trusted(request: Request) {
    const proof = request.headers.get(SSO_FRONTEND_SECRET_HEADER);
    return (
      !!this.secret &&
      proof !== null &&
      timingSafeEqual(digest(proof), this.secret)
    );
  }

  /** The browser's IP address, when the web server proved it. */
  address(request: Request): string | null {
    const address = request.headers.get(SSO_CLIENT_ADDRESS_HEADER);
    if (address === null || !this.trusted(request)) return null;

    this.proven = true;
    return clientNetwork(address) ? address : null;
  }

  /** The browser's user agent (cleaned for storage), when the web server vouched for it. */
  userAgent(request: Request): string | null {
    const agent = request.headers.get(CLIENT_USER_AGENT_HEADER);
    return agent !== null && this.trusted(request)
      ? cleanUserAgent(agent)
      : null;
  }

  /** Who attempts a protected action, as `ProtectionService` counts it. */
  attempt(request: Request) {
    const client = this.resolve(request);
    return {
      client: client === UNVERIFIED_CLIENT ? null : client,
      address: this.address(request),
      captchaToken:
        request.headers.get(CAPTCHA_TOKEN_HEADER)?.slice(0, 4096) || null,
    };
  }

  /** The network the client is counted by: `ip:<network>`, or `UNVERIFIED_CLIENT`. */
  resolve(request: Request): string {
    const address = this.address(request);
    const network = address && clientNetwork(address);

    return network ? `ip:${network}` : UNVERIFIED_CLIENT;
  }
}
