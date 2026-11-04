import type { Database } from '#api/infra/prisma/client';
import { Prisma } from '#api/infra/prisma/generated/client';

export const failedJobs = (before: Date) =>
  Prisma.sql`FROM jobs WHERE failed_at < ${before}`;
export const staleNotices = (before: Date) =>
  Prisma.sql`FROM notice_windows WHERE window_end < ${before} AND deferred = 0`;

/** Consumed password/SSO proofs and completed jobs are already physically removed. */
const predicates = (now: Date) => {
  const retained = new Date(now.getTime() - 30 * 86400000);

  return {
    sessions: Prisma.sql`FROM sessions WHERE expires_at <= ${now}`,
    passwords: Prisma.sql`FROM password_tokens WHERE expires_at <= ${now}`,
    apiTokens: Prisma.sql`FROM api_tokens WHERE expires_at <= ${now}`,
    sso: Prisma.sql`FROM sso_transactions WHERE expires_at <= ${now}`,
    jobs: failedJobs(retained),
    rateLimits: Prisma.sql`FROM rate_limit_buckets WHERE expires_at < ${now}`,
    notices: staleNotices(retained),
  };
};

export const purgeExpired = async (
  db: Pick<Database, '$executeRaw'>,
  now: Date,
  kind: keyof ReturnType<typeof predicates>,
  limit = 100,
) => db.$executeRaw(Prisma.sql`DELETE ${predicates(now)[kind]} LIMIT ${limit}`);

export class PrismaExpiredCleanup {
  constructor(private readonly db: Database) {}

  async count(now: Date) {
    let count = 0;

    for (const predicate of Object.values(predicates(now))) {
      const [row] = await this.db.$queryRaw<{ total: bigint }[]>(
        Prisma.sql`SELECT COUNT(*) AS total ${predicate}`,
      );

      count += Number(row!.total);
    }

    return count;
  }

  async batch(now: Date, limit: number) {
    let count = 0;

    for (const predicate of Object.values(predicates(now))) {
      count += await this.db.$executeRaw(
        Prisma.sql`DELETE ${predicate} LIMIT ${limit - count}`,
      );
      if (count === limit) break;
    }

    return count;
  }
}
