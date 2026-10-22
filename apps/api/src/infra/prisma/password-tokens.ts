import type {
  PasswordTokenPurpose,
  PasswordTokenRepository,
} from '#api/domain/auth/ports';
import type { Database } from '#api/infra/prisma/client';

export class PrismaPasswordTokenRepository implements PasswordTokenRepository {
  constructor(private readonly db: Database) {}

  async insert(token: {
    tokenHash: string;
    userId: string;
    purpose: PasswordTokenPurpose;
    expiresAt: Date;
  }) {
    await this.db.passwordToken.create({ data: token });
  }

  async purge(now: Date) {
    await this.db.passwordToken.deleteMany({
      where: { expiresAt: { lte: now } },
    });
  }
}
