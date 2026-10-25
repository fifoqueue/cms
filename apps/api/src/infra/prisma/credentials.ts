import type { CredentialRepository } from '#api/domain/auth/password-service';
import type { Database } from '#api/infra/prisma/client';

export class PrismaCredentialRepository implements CredentialRepository {
  constructor(private readonly db: Database) {}

  change(userId: string, passwordHash: string, keepSessionHash: string | null) {
    return this.db.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { passwordHash } });
      await tx.passwordToken.deleteMany({ where: { userId } });
      await tx.session.deleteMany({
        where: {
          userId,
          ...(keepSessionHash ? { tokenHash: { not: keepSessionHash } } : {}),
        },
      });
      await tx.apiToken.deleteMany({ where: { userId } });
      await tx.recoveryCode.deleteMany({ where: { userId } });
    });
  }

  async validReset(tokenHash: string, now: Date) {
    const token = await this.db.passwordToken.findUnique({
      where: { tokenHash },
      select: { expiresAt: true },
    });
    return !!token && token.expiresAt > now;
  }

  reset(tokenHash: string, now: Date, passwordHash: string) {
    return this.db.$transaction(async (tx) => {
      const token = await tx.passwordToken.findUnique({ where: { tokenHash } });
      if (!token || token.expiresAt <= now) return false;

      const { count } = await tx.passwordToken.deleteMany({
        where: { tokenHash, expiresAt: { gt: now } },
      });
      if (count !== 1) return false;

      await tx.user.update({
        where: { id: token.userId },
        data: { passwordHash },
      });
      await tx.passwordToken.deleteMany({ where: { userId: token.userId } });
      await tx.session.deleteMany({ where: { userId: token.userId } });
      await tx.apiToken.deleteMany({ where: { userId: token.userId } });
      await tx.recoveryCode.deleteMany({ where: { userId: token.userId } });
      return true;
    });
  }
}
