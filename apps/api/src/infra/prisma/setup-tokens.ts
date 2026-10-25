import type { SetupTokens } from '#api/domain/auth/setup-tokens';
import type { Database } from '#api/infra/prisma/client';

export class PrismaSetupTokens implements SetupTokens {
  constructor(private readonly db: Database) {}

  find(tokenHash: string, now: Date) {
    return this.db.passwordToken.findFirst({
      where: { tokenHash, expiresAt: { gt: now } },
      select: { userId: true, expiresAt: true },
    });
  }

  async consume(tokenHash: string, userId: string, now: Date) {
    const { count } = await this.db.passwordToken.deleteMany({
      where: { tokenHash, userId, expiresAt: { gt: now } },
    });
    return count === 1;
  }
}
