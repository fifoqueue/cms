import type {
  SessionRecord,
  SessionRepository,
  UserRecord,
  UserRepository,
} from '#api/domain/auth/ports';
import { unauthorized, Errors } from '#api/shared/errors';
import { guardUnique } from '#api/infra/prisma/client';
import type { Database } from '#api/infra/prisma/client';
import { Prisma } from '#api/infra/prisma/generated/client';
import { takenSlugs } from '#api/infra/prisma/taken-slugs';

export class PrismaUserRepository implements UserRepository {
  constructor(private readonly db: Pick<Database, 'user' | '$queryRaw'>) {}

  count() {
    return this.db.user.count();
  }

  findById(id: string) {
    return this.db.user.findUnique({ where: { id } });
  }

  findByEmail(email: string) {
    return this.db.user.findUnique({ where: { email } });
  }

  async insert(user: UserRecord) {
    await guardUnique(
      () => this.db.user.create({ data: user }),
      Errors.EmailRegistered,
    );
  }

  async setPassword(id: string, passwordHash: string) {
    await this.db.user.update({ where: { id }, data: { passwordHash } });
  }

  async takenSlugs(slugs: readonly string[]) {
    return takenSlugs(this.db, 'users', slugs);
  }
}

export class PrismaSessionRepository implements SessionRepository {
  constructor(private readonly db: Pick<Database, 'session'>) {}

  async insert(session: SessionRecord) {
    try {
      // No read-back: a session whose identity is deleted right after insert is cascaded away.
      await this.db.session.createMany({ data: [session] });
    } catch (error) {
      // The foreign key refuses a session whose identity was unlinked in the meantime.
      if (
        session.identityId &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      )
        throw unauthorized(Errors.SsoAccountUnlinked);
      throw error;
    }
  }

  find(tokenHash: string) {
    return this.db.session.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
  }

  async delete(tokenHash: string) {
    await this.db.session.deleteMany({ where: { tokenHash } });
  }

  async deleteForUser(userId: string, keep?: string) {
    await this.db.session.deleteMany({
      where: { userId, ...(keep ? { tokenHash: { not: keep } } : {}) },
    });
  }

  async deleteExpired(now: Date) {
    await this.db.session.deleteMany({ where: { expiresAt: { lte: now } } });
  }

  listForUser(userId: string, now: Date) {
    return this.db.session.findMany({
      where: { userId, expiresAt: { gt: now } },
      orderBy: [{ createdAt: 'desc' }, { tokenHash: 'asc' }],
      take: 100,
    });
  }
}
