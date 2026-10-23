export interface UserRecord {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  /** A `Role`; unknown values grant nothing. */
  role: string;
  slug: string;
  bio: string;
  /** `AdminLocale` or empty. */
  locale: string;
  createdAt: Date;
}

export interface UserRepository {
  count(): Promise<number>;
  findById(id: string): Promise<UserRecord | null>;
  findByEmail(email: string): Promise<UserRecord | null>;
  /** Throws `conflict` when the email or slug is taken. */
  insert(user: UserRecord): Promise<void>;
  /** The subset of `slugs` other users already use, in one read, compared as the store's unique index compares them. */
  takenSlugs(slugs: readonly string[]): Promise<Set<string>>;
  setPassword(id: string, passwordHash: string): Promise<void>;
}

export type PasswordTokenPurpose = 'invite' | 'reset';

/** Single-use links that let a user choose a password. Only digests are stored. */
export interface PasswordTokenRepository {
  insert(token: {
    tokenHash: string;
    userId: string;
    purpose: PasswordTokenPurpose;
    expiresAt: Date;
  }): Promise<void>;
  purge(now: Date): Promise<void>;
}

export interface SessionRecord {
  tokenHash: string;
  userId: string;
  /** The linked identity the session was issued through; `null` for every other sign-in. */
  identityId: string | null;
  expiresAt: Date;
}

/** A stored session read together with its user (the foreign key guarantees one). */
export interface SessionWithUser extends SessionRecord {
  user: UserRecord;
}

export interface SessionRepository {
  /**
   * Stores the session. A session bound to an identity exists only while that identity does:
   * when it is already gone this throws `unauthorized` and stores nothing, and removing it
   * later removes the session (see `ExternalIdentityRepository`).
   */
  insert(session: SessionRecord): Promise<void>;
  /** The session and its user in one read. */
  find(tokenHash: string): Promise<SessionWithUser | null>;
  delete(tokenHash: string): Promise<void>;
  /** Removes every session that expired at or before `now`. */
  deleteExpired(now: Date): Promise<void>;
  /** Signs the user out everywhere, except the session `keep` when given. */
  deleteForUser(userId: string, keep?: string): Promise<void>;
}

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(password: string, hash: string): Promise<boolean>;
}

/** Opaque bearer tokens. Only digests are stored. */
export interface TokenIssuer {
  issue(): string;
  digest(token: string): string;
}
