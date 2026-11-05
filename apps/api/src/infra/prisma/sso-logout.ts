import type {
  SsoLogoutSessions,
  VerifiedLogout,
} from '#api/domain/auth/sso-logout-ports';
import type { Database } from '#api/infra/prisma/client';
import { Prisma } from '#api/infra/prisma/generated/client';

const encoder = new TextEncoder();

export class PrismaSsoLogoutSessions implements SsoLogoutSessions {
  constructor(private readonly db: Database) {}

  deleteMatching(logout: VerifiedLogout, cutoff: Date) {
    return this.db.$transaction(async (tx) => {
      const sid =
        logout.sid !== undefined
          ? Prisma.sql`AND oidc_sid = ${encoder.encode(logout.sid)}`
          : Prisma.empty;
      const subject =
        logout.subject !== undefined
          ? Prisma.sql`AND oidc_subject = ${encoder.encode(logout.subject)}`
          : Prisma.empty;
      const rows = await tx.$queryRaw<{ tokenHash: string; userId: string }[]>(
        Prisma.sql`
          SELECT token_hash AS tokenHash, user_id AS userId
          FROM sessions
          WHERE oidc_issuer = ${encoder.encode(logout.issuer)}
            ${sid} ${subject} AND created_at <= ${cutoff}
          ORDER BY token_hash
          FOR UPDATE
        `,
      );

      if (!rows.length) return [];
      await tx.session.deleteMany({
        where: { tokenHash: { in: rows.map((row) => row.tokenHash) } },
      });

      return [...new Set(rows.map((row) => row.userId))];
    });
  }
}
