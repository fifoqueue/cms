import { createHash } from 'node:crypto';
import type { RateRule } from '@cms/sdk';
import type { RateLimitStore } from '#api/domain/security/ports';
import type { Database } from '#api/infra/prisma/client';
import { Prisma } from '#api/infra/prisma/generated/client';

const hash = (key: string) => createHash('sha256').update(key).digest('hex');

interface Bucket {
  windowStart: Date;
  hits: number;
  blockedUntil: Date | null;
}

const windowEnd = (bucket: Bucket, rule: RateRule) =>
  new Date(bucket.windowStart.getTime() + rule.windowSeconds * 1000);

const isExceeded = (bucket: Bucket | null, rule: RateRule, now: Date) =>
  !!bucket &&
  ((bucket.blockedUntil !== null && bucket.blockedUntil > now) ||
    (windowEnd(bucket, rule) > now && bucket.hits >= rule.max));

/** Counters in `rate_limit_buckets`; each hit locks its row, so processes count exactly. */
export class PrismaRateLimitStore implements RateLimitStore {
  constructor(private readonly db: Database) {}

  async exceeded(key: string, rule: RateRule, now: Date) {
    const bucket = await this.db.rateLimitBucket.findUnique({
      where: { keyHash: hash(key) },
      select: { windowStart: true, hits: true, blockedUntil: true },
    });
    return isExceeded(bucket, rule, now);
  }

  async hit(key: string, rule: RateRule, now: Date) {
    const keyHash = hash(key);
    return this.db.$transaction(async (tx) => {
      // ON DUPLICATE KEY takes the row's exclusive lock at once. INSERT IGNORE would take a shared
      // lock first, and two requests upgrading it for the FOR UPDATE below deadlock each other.
      await tx.$executeRaw`INSERT INTO rate_limit_buckets (key_hash, window_start, hits, expires_at) VALUES (${keyHash}, ${now}, 0, ${now}) ON DUPLICATE KEY UPDATE key_hash = key_hash`;
      const [row] = await tx.$queryRaw<
        { windowStart: Date; hits: number; blockedUntil: Date | null }[]
      >(Prisma.sql`
        SELECT window_start AS windowStart, hits, blocked_until AS blockedUntil
        FROM rate_limit_buckets WHERE key_hash = ${keyHash} FOR UPDATE
      `);
      const current: Bucket = {
        windowStart: row!.windowStart,
        hits: Number(row!.hits),
        blockedUntil: row!.blockedUntil,
      };
      const fresh = windowEnd(current, rule) <= now;
      const next: Bucket = {
        windowStart: fresh ? now : current.windowStart,
        hits: (fresh ? 0 : current.hits) + 1,
        blockedUntil:
          current.blockedUntil && current.blockedUntil > now
            ? current.blockedUntil
            : null,
      };
      const over = next.hits > rule.max;
      if (over && !next.blockedUntil)
        next.blockedUntil = rule.blockSeconds
          ? new Date(now.getTime() + rule.blockSeconds * 1000)
          : windowEnd(next, rule);
      const expiresAt = new Date(
        Math.max(
          windowEnd(next, rule).getTime(),
          next.blockedUntil?.getTime() ?? 0,
        ),
      );
      await tx.rateLimitBucket.updateMany({
        where: { keyHash },
        data: { ...next, expiresAt },
      });
      return over || (!!current.blockedUntil && current.blockedUntil > now);
    });
  }

  async purge(now: Date) {
    await this.db.rateLimitBucket.deleteMany({
      where: { expiresAt: { lt: now } },
    });
  }
}
