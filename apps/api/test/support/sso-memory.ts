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
  SsoAccessTransactions,
  SsoAccessContext,
} from '#api/domain/auth/sso-ports';
import { conflict, unauthorized } from '#api/shared/errors';
import { takenSlugs } from '#test/support/memory-rows';
import { MemoryPasswordTokens } from '#test/support/memory-security';

export class MemorySsoAccessTransactions implements SsoAccessTransactions {
  private tail: Promise<unknown> = Promise.resolve();
  constructor(private readonly context: SsoAccessContext) {}
  run<T>(work: (context: SsoAccessContext) => Promise<T>) {
    const next = this.tail.then(() => work(this.context));
    this.tail = next.catch(() => undefined);
    return next;
  }
}

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
    return takenSlugs(this.rows.values(), slugs);
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

  async listForUser(userId: string, now: Date) {
    return structuredClone(
      [...this.rows.values()]
        .filter((row) => row.userId === userId && row.expiresAt > now)
        .sort(
          (a, b) =>
            b.createdAt.getTime() - a.createdAt.getTime() ||
            a.tokenHash.localeCompare(b.tokenHash),
        ),
    );
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

  constructor(
    private readonly sessions: MemorySessions,
    readonly tokens = new MemoryPasswordTokens(),
  ) {}

  has(id: string) {
    return [...this.rows.values()].some((row) => row.id === id);
  }

  async find(issuer: string, subject: string) {
    return structuredClone(this.rows.get(`${issuer}\n${subject}`) ?? null);
  }

  async findByUser(userId: string) {
    return structuredClone(
      [...this.rows.values()].filter((row) => row.userId === userId),
    );
  }

  async claimUser(tokenHash: string, now: Date) {
    const token = this.tokens.rows.get(tokenHash);
    return token && token.expiresAt > now ? token.userId : null;
  }

  async claim(identity: ExternalIdentityRecord, tokenHash: string, now: Date) {
    const token = this.tokens.rows.get(tokenHash);
    if (!token || token.userId !== identity.userId || token.expiresAt <= now)
      return false;
    if (
      [...this.rows.values()].some(
        (row) =>
          row.userId === identity.userId && row.issuer === identity.issuer,
      )
    )
      return false;
    this.setLink(identity);
    for (const [hash, row] of this.tokens.rows)
      if (row.userId === identity.userId) this.tokens.rows.delete(hash);
    return true;
  }

  async link(identity: ExternalIdentityRecord) {
    this.setLink(identity);
  }

  private setLink(identity: ExternalIdentityRecord) {
    const key = `${identity.issuer}\n${identity.subject}`;
    const owner = this.rows.get(key)?.userId;
    if (owner && owner !== identity.userId)
      throw conflict(
        'This single sign-on account is already linked to another administrator.',
      );
    for (const [key, row] of this.rows)
      if (row.userId === identity.userId && row.issuer === identity.issuer) {
        this.rows.delete(key);
        this.sessions.deleteByIdentity(row.id);
      }
    this.rows.set(key, structuredClone(identity));
  }

  async unlink(userId: string, identityId: string) {
    for (const [key, row] of this.rows)
      if (row.userId === userId && row.id === identityId) {
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
