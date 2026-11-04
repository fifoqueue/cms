import { createHash } from 'node:crypto';
import { purgeExpired } from '#api/infra/prisma/expired-cleanup';
import type { RateRule } from '@cms/sdk';
import type { RateLimitStore } from '#api/domain/security/ports';
import type { Database } from '#api/infra/prisma/client';
import { Prisma } from '#api/infra/prisma/generated/client';
import {
  isExceeded,
  nextBucket,
  windowEnd,
} from '#api/infra/prisma/rate-limit-window';
import type { Bucket } from '#api/infra/prisma/rate-limit-window';

const hash = (key: string) => createHash('sha256').update(key).digest('hex');

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
      // ON DUPLICATE KEY takes the row's exclusive lock at once, so concurrent requests queue on
      // it and never deadlock upgrading a shared lock for the FOR UPDATE below.
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
      const { next, exceeded } = nextBucket(current, rule, now);
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

      return exceeded;
    });
  }

  async purge(now: Date) {
    while (await purgeExpired(this.db, now, 'rateLimits')) {
      /* bounded batches */
    }
  }
}
