import type {
  PasswordTokenPurpose,
  PasswordTokenRepository,
} from '#api/domain/auth/ports';
import type { Database } from '#api/infra/prisma/client';
import { purgeExpired } from '#api/infra/prisma/expired-cleanup';

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
    while (await purgeExpired(this.db, now, 'passwords')) {
      /* bounded batches */
    }
  }
}
