import type {
  SessionRecord,
  SessionRepository,
  UserRecord,
  UserRepository,
} from '../../domain/auth/ports';
import { unauthorized } from '../../shared/errors';
import { guardUnique } from './client';
import type { Database } from './client';
import { Prisma } from './generated/client';

export class PrismaUserRepository implements UserRepository {
  constructor(private readonly db: Pick<Database, 'user'>) {}

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
      'Email is already registered',
    );
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
        throw unauthorized(
          'This single sign-on account is no longer linked. Please try again.',
        );
      throw error;
    }
  }

  find(tokenHash: string) {
    return this.db.session.findUnique({ where: { tokenHash } });
  }

  async delete(tokenHash: string) {
    await this.db.session.deleteMany({ where: { tokenHash } });
  }
}
