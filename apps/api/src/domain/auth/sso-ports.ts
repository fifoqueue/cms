import type { SettingsRepository } from '#api/domain/site/site-service';
import type { VerifiedLogout } from '#api/domain/auth/sso-logout-ports';

export interface SsoAccessContext {
  settings: SettingsRepository;
  identities: Pick<ExternalIdentityRepository, 'findByUser' | 'unlink'>;
}
/** Policy writes and unlink checks share one transaction and lock across instances. */
export interface SsoAccessTransactions {
  run<T>(work: (context: SsoAccessContext) => Promise<T>): Promise<T>;
}

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

/** The provider-asserted identity. Email or profile claims are never part of it. */
export interface VerifiedIdentity {
  issuer: string;
  subject: string;
}

/** Verified ID token claims bound only to the RP session, never to an identity link. */
export interface OidcSessionBinding extends VerifiedIdentity {
  sid?: string;
  /** Raw verification results are not assignable to stored session bindings. */
  idToken?: never;
  /** Server-only logout material; absent on sessions issued before RP-Initiated Logout. */
  logout?: { providerId: string; clientId: string; sealedIdToken: string };
}

/** Verified token response, used only to seal the ID token before entering the flow engine. */
export interface VerifiedOidcIdentity extends VerifiedIdentity {
  sid?: string;
  /** The RP client whose audience was verified, not an arbitrary token audience. */
  clientId: string;
  idToken: string;
}

/** Standards-based OpenID Connect relying party (Authorization Code flow with PKCE S256). */
export interface OidcProvider {
  authorize(): Promise<OidcAuthorizationRequest>;

  /**
   * Validates the authorization response (`query` of the redirect URI), redeems the code with the
   * PKCE verifier and verifies the ID token (signature, issuer, audience, expiry, nonce).
   * Throws `unauthorized` when anything does not match.
   */
  verify(query: string, checks: OidcChecks): Promise<VerifiedOidcIdentity>;

  /** Null if the issuing client differs from the current client or discovery has no endpoint. */
  endSession(clientId: string, idTokenHint?: string): Promise<string | null>;

  /** Verifies a signed, fresh logout token for this issuer/client; null on mismatch or rejection. */
  verifyLogout(token: string): Promise<VerifiedLogout | null>;
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
 * Explicit links between provider identities and local users. A user has at most one per issuer.
 * Issuer and subject are matched and kept unique byte for byte: no case folding, no
 * normalization, no padding.
 */
export interface ExternalIdentityRepository {
  find(issuer: string, subject: string): Promise<ExternalIdentityRecord | null>;

  findByUser(userId: string): Promise<ExternalIdentityRecord[]>;
  claimUser(tokenHash: string, now: Date): Promise<string | null>;
  /** Consumes a live token and all sibling reset/invite tokens atomically with linking.
   * Refuses expired/consumed proofs and replacement of an existing link for that issuer. */
  claim(
    identity: ExternalIdentityRecord,
    tokenHash: string,
    now: Date,
  ): Promise<boolean>;

  /**
   * Links the identity, replacing the user's previous link and, atomically with it, every
   * session issued through that link. Throws `conflict` when the identity is linked to another user.
   */
  link(identity: ExternalIdentityRecord): Promise<void>;

  /** Removes the user's link and, atomically with it, every session issued through it. */
  unlink(userId: string, identityId: string): Promise<void>;
}

export interface SsoTransactionRecord extends OidcChecks {
  providerId: string;
  claimTokenHash: string | null;
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
