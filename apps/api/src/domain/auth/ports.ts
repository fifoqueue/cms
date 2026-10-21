export interface UserRecord {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  createdAt: Date;
}

export interface UserRepository {
  count(): Promise<number>;
  findById(id: string): Promise<UserRecord | null>;
  findByEmail(email: string): Promise<UserRecord | null>;
  insert(user: UserRecord): Promise<void>;
}

export interface SessionRecord {
  tokenHash: string;
  userId: string;
  /** The linked identity the session was issued through; `null` for every other sign-in. */
  identityId: string | null;
  expiresAt: Date;
}

export interface SessionRepository {
  /**
   * Stores the session. A session bound to an identity exists only while that identity does:
   * when it is already gone this throws `unauthorized` and stores nothing, and removing it
   * later removes the session (see `ExternalIdentityRepository`).
   */
  insert(session: SessionRecord): Promise<void>;
  find(tokenHash: string): Promise<SessionRecord | null>;
  delete(tokenHash: string): Promise<void>;
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
