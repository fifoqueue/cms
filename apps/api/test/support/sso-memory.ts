// In-memory single sign-on adapters with the same contracts as the Prisma adapters.
import type {
  PasswordHasher,
  SessionRecord,
  SessionRepository,
  UserRecord,
  UserRepository,
} from '#api/domain/auth/ports';
import type {
  AdmissionLimits,
  ExternalIdentityRecord,
  ExternalIdentityRepository,
  SsoTransactionRecord,
  SsoTransactionRepository,
} from '#api/domain/auth/sso-ports';
import { conflict, unauthorized } from '#api/shared/errors';

export class MemoryUsers implements UserRepository {
  readonly rows = new Map<string, UserRecord>();

  async count() {
    return this.rows.size;
  }

  async findById(id: string) {
    return structuredClone(this.rows.get(id) ?? null);
  }

  async findByEmail(email: string) {
    return structuredClone(
      [...this.rows.values()].find((row) => row.email === email) ?? null,
    );
  }

  async insert(user: UserRecord) {
    if (await this.findByEmail(user.email))
      throw conflict('Email is already registered');
    this.rows.set(user.id, structuredClone(user));
  }

  async setPassword(id: string, passwordHash: string) {
    const row = this.rows.get(id);
    if (row) row.passwordHash = passwordHash;
  }

  async takenSlugs(slugs: readonly string[]) {
    return new Set(
      [...this.rows.values()]
        .map((row) => row.slug)
        .filter((slug) => slugs.includes(slug)),
    );
  }
}

/** Sessions with the identity foreign key of the DB: bound sessions need a live identity. */
export class MemorySessions implements SessionRepository {
  readonly rows = new Map<string, SessionRecord>();

  constructor(
    private readonly identityExists: (id: string) => boolean = () => false,
    private readonly users: MemoryUsers = new MemoryUsers(),
  ) {}

  async insert(session: SessionRecord) {
    if (session.identityId && !this.identityExists(session.identityId))
      throw unauthorized(
        'This single sign-on account is no longer linked. Please try again.',
      );
    this.rows.set(session.tokenHash, structuredClone(session));
  }

  async find(tokenHash: string) {
    const session = this.rows.get(tokenHash);
    const user = session && this.users.rows.get(session.userId);
    return user ? structuredClone({ ...session, user }) : null;
  }

  async delete(tokenHash: string) {
    this.rows.delete(tokenHash);
  }

  async deleteForUser(userId: string, keep?: string) {
    for (const [key, row] of this.rows)
      if (row.userId === userId && key !== keep) this.rows.delete(key);
  }

  async deleteExpired(now: Date) {
    for (const [key, row] of this.rows)
      if (row.expiresAt <= now) this.rows.delete(key);
  }

  /** `ON DELETE CASCADE` from the identity. */
  deleteByIdentity(identityId: string) {
    for (const [key, row] of this.rows)
      if (row.identityId === identityId) this.rows.delete(key);
  }
}

/** Exact (byte-for-byte) keys, like the VARBINARY columns. Deleting cascades to sessions. */
export class MemoryIdentities implements ExternalIdentityRepository {
  readonly rows = new Map<string, ExternalIdentityRecord>();

  constructor(private readonly sessions: MemorySessions) {}

  has(id: string) {
    return [...this.rows.values()].some((row) => row.id === id);
  }

  async find(issuer: string, subject: string) {
    return structuredClone(this.rows.get(`${issuer}\n${subject}`) ?? null);
  }

  async findByUser(userId: string) {
    const row = [...this.rows.values()].find((row) => row.userId === userId);
    return structuredClone(row ?? null);
  }

  async link(identity: ExternalIdentityRecord) {
    const key = `${identity.issuer}\n${identity.subject}`;
    const owner = this.rows.get(key)?.userId;
    if (owner && owner !== identity.userId)
      throw conflict(
        'This single sign-on account is already linked to another administrator.',
      );
    await this.unlink(identity.userId);
    this.rows.set(key, structuredClone(identity));
  }

  async unlink(userId: string) {
    for (const [key, row] of this.rows)
      if (row.userId === userId) {
        this.rows.delete(key);
        this.sessions.deleteByIdentity(row.id);
      }
  }
}

/** Sessions and identities wired like the DB tables they stand for. */
export const createMemoryAuthStore = (users = new MemoryUsers()) => {
  const sessions: MemorySessions = new MemorySessions(
    (id) => identities.has(id),
    users,
  );
  const identities = new MemoryIdentities(sessions);

  return { sessions, identities };
};

export class MemorySsoTransactions implements SsoTransactionRepository {
  readonly rows = new Map<string, SsoTransactionRecord>();

  // No await between the checks and the insert, so admission is atomic like the DB lock.
  async admit(
    transaction: SsoTransactionRecord,
    now: Date,
    { total, perClient }: AdmissionLimits,
  ) {
    for (const [key, row] of this.rows)
      if (row.expiresAt <= now) this.rows.delete(key);

    const fromClient = [...this.rows.values()].filter(
      (row) => row.clientKey === transaction.clientKey,
    ).length;

    if (this.rows.size >= total || fromClient >= perClient) return false;

    this.rows.set(transaction.handleHash, structuredClone(transaction));

    return true;
  }

  async take(handleHash: string) {
    const row = this.rows.get(handleHash) ?? null;
    this.rows.delete(handleHash);
    return row;
  }
}

/** Fast, deterministic stand-in for argon2. */
export const plainHasher: PasswordHasher = {
  hash: async (password) => `hashed:${password}`,
  verify: async (password, hash) => hash === `hashed:${password}`,
};
