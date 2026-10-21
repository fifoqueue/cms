/** A fresh authorization request. `state`, `nonce` and `codeVerifier` stay on the server. */
export interface OidcAuthorizationRequest {
  url: string;
  state: string;
  nonce: string;
  codeVerifier: string;
}

export interface OidcChecks {
  state: string;
  nonce: string;
  codeVerifier: string;
}

/** The provider-asserted identity. Email or profile claims are deliberately not part of it. */
export interface VerifiedIdentity {
  issuer: string;
  subject: string;
}

/** Standards-based OpenID Connect relying party (Authorization Code flow with PKCE S256). */
export interface OidcProvider {
  authorize(): Promise<OidcAuthorizationRequest>;

  /**
   * Validates the authorization response (`query` of the redirect URI), redeems the code with the
   * PKCE verifier and verifies the ID token (signature, issuer, audience, expiry, nonce).
   * Throws `unauthorized` when anything does not match.
   */
  verify(query: string, checks: OidcChecks): Promise<VerifiedIdentity>;
}

/** Longest issuer or subject, in UTF-8 bytes, that identities can be stored with. */
export const IDENTITY_MAX_BYTES = 255;

export interface ExternalIdentityRecord extends VerifiedIdentity {
  /** Immutable. Sessions issued through the identity are bound to it. */
  id: string;
  userId: string;
  createdAt: Date;
}

/**
 * Explicit links between provider identities and local users. A user has at most one.
 * Issuer and subject are matched and kept unique byte for byte: no case folding, no
 * normalization, no padding.
 */
export interface ExternalIdentityRepository {
  find(issuer: string, subject: string): Promise<ExternalIdentityRecord | null>;

  findByUser(userId: string): Promise<ExternalIdentityRecord | null>;

  /**
   * Links the identity, replacing the user's previous link and, atomically with it, every
   * session issued through that link. Throws `conflict` when the identity is linked to another user.
   */
  link(identity: ExternalIdentityRecord): Promise<void>;

  /** Removes the user's link and, atomically with it, every session issued through it. */
  unlink(userId: string): Promise<void>;
}

export interface SsoTransactionRecord extends OidcChecks {
  handleHash: string;
  /** Set when the transaction links an identity to this user instead of signing in. */
  userId: string | null;
  /** Digest identifying the client that started the request. */
  clientKey: string;
  expiresAt: Date;
}

export interface AdmissionLimits {
  /** Pending transactions overall. */
  total: number;
  /** Pending transactions per client key. */
  perClient: number;
}

/** Pending authorization requests. Bounded in number; each one can be taken exactly once. */
export interface SsoTransactionRepository {
  /**
   * Deletes transactions expired at `now`, then stores `transaction` only if fewer than
   * `limits.total` remain overall and fewer than `limits.perClient` with its client key.
   * Returns whether it was stored. Atomic across concurrent callers and processes, so neither
   * bound is ever exceeded.
   */
  admit(
    transaction: SsoTransactionRecord,
    now: Date,
    limits: AdmissionLimits,
  ): Promise<boolean>;

  /** Removes and returns the transaction. Concurrent takes of one handle yield it at most once. */
  take(handleHash: string): Promise<SsoTransactionRecord | null>;
}
