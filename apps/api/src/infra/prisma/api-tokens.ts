import type {
  ApiTokenRecord,
  ApiTokenRepository,
} from '#api/domain/auth/api-tokens';
import type { Database } from '#api/infra/prisma/client';

const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

const columns = {
  id: true,
  userId: true,
  name: true,
  createdAt: true,
  lastUsedAt: true,
  expiresAt: true,
} as const;

export class PrismaApiTokenRepository implements ApiTokenRepository {
  constructor(private readonly db: Database) {}

  async insert(token: ApiTokenRecord & { tokenHash: string }) {
    await this.db.apiToken.create({ data: token });
  }

  list(userId: string) {
    return this.db.apiToken.findMany({
      where: { userId },
      select: columns,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  }

  async delete(id: string, userId: string) {
    const { count } = await this.db.apiToken.deleteMany({
      where: { id, userId },
    });
    return count === 1;
  }

  async authenticate(tokenHash: string, now: Date) {
    const row = await this.db.apiToken.findUnique({
      where: { tokenHash },
      select: { id: true, expiresAt: true, lastUsedAt: true, user: true },
    });
    if (!row || (row.expiresAt && row.expiresAt <= now)) return null;
    if (
      row.lastUsedAt === null ||
      row.lastUsedAt < new Date(now.getTime() - TOUCH_INTERVAL_MS)
    )
      await this.db.apiToken.updateMany({
        where: {
          id: row.id,
          OR: [
            { lastUsedAt: null },
            { lastUsedAt: { lt: new Date(now.getTime() - TOUCH_INTERVAL_MS) } },
          ],
        },
        data: { lastUsedAt: now },
      });
    return { id: row.id, user: row.user };
  }
}
