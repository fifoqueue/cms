import type { RateRule } from '@cms/sdk';
import type { RateLimitStore } from '#api/domain/security/ports';
import type { SecretBox } from '#api/domain/ports';
import type {
  PasswordTokenPurpose,
  PasswordTokenRepository,
} from '#api/domain/auth/ports';
import type { CredentialRepository } from '#api/domain/auth/password-service';
import type { MemorySessions, MemoryUsers } from '#test/support/sso-memory';

interface Bucket {
  windowStart: Date;
  hits: number;
  blockedUntil: Date | null;
}

const windowEnd = (bucket: Bucket, rule: RateRule) =>
  new Date(bucket.windowStart.getTime() + rule.windowSeconds * 1000);

const isExceeded = (bucket: Bucket | undefined, rule: RateRule, now: Date) =>
  !!bucket &&
  ((bucket.blockedUntil !== null && bucket.blockedUntil > now) ||
    (windowEnd(bucket, rule) > now && bucket.hits >= rule.max));

/** Same contract as `PrismaRateLimitStore`. */
export class MemoryRateLimitStore implements RateLimitStore {
  readonly buckets = new Map<string, Bucket>();

  async exceeded(key: string, rule: RateRule, now: Date) {
    return isExceeded(this.buckets.get(key), rule, now);
  }

  async hit(key: string, rule: RateRule, now: Date) {
    const current = this.buckets.get(key);
    const fresh = !current || windowEnd(current, rule) <= now;
    const next: Bucket = {
      windowStart: fresh ? now : current.windowStart,
      hits: (fresh ? 0 : current.hits) + 1,
      blockedUntil:
        current?.blockedUntil && current.blockedUntil > now
          ? current.blockedUntil
          : null,
    };
    const over = next.hits > rule.max;
    if (over && !next.blockedUntil)
      next.blockedUntil = rule.blockSeconds
        ? new Date(now.getTime() + rule.blockSeconds * 1000)
        : windowEnd(next, rule);
    this.buckets.set(key, next);
    return over || (!!current?.blockedUntil && current.blockedUntil > now);
  }

  async purge() {}
}

/** Reversible stand-in for the AES box. */
export const plainSecretBox: SecretBox = {
  seal: (plain) => `sealed:${plain}`,
  open: (sealed) => (sealed.startsWith('sealed:') ? sealed.slice(7) : null),
};

/** Same contract as `PrismaPasswordTokenRepository`. */
export class MemoryPasswordTokens implements PasswordTokenRepository {
  readonly rows = new Map<
    string,
    { userId: string; purpose: PasswordTokenPurpose; expiresAt: Date }
  >();

  async insert(token: {
    tokenHash: string;
    userId: string;
    purpose: PasswordTokenPurpose;
    expiresAt: Date;
  }) {
    this.rows.set(token.tokenHash, token);
  }

  async purge() {}
}

export class MemoryCredentials implements CredentialRepository {
  constructor(
    private readonly users: MemoryUsers,
    private readonly sessions: MemorySessions,
    private readonly tokens: MemoryPasswordTokens,
    private readonly revokeApiTokens: (userId: string) => void = () => {},
  ) {}

  async change(
    userId: string,
    passwordHash: string,
    keepSessionHash: string | null,
  ) {
    await this.users.setPassword(userId, passwordHash);
    for (const [key, row] of this.tokens.rows)
      if (row.userId === userId) this.tokens.rows.delete(key);
    await this.sessions.deleteForUser(userId, keepSessionHash ?? undefined);
    this.revokeApiTokens(userId);
  }

  async reset(tokenHash: string, now: Date, passwordHash: string) {
    const token = this.tokens.rows.get(tokenHash);
    if (!token || token.expiresAt <= now) return false;
    this.tokens.rows.delete(tokenHash);
    await this.change(token.userId, passwordHash, null);
    return true;
  }

  async validReset(tokenHash: string, now: Date) {
    const row = this.tokens.rows.get(tokenHash);
    return !!row && row.expiresAt > now;
  }
}
