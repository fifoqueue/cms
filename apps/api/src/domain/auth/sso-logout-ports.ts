/** Seconds accepted for provider/RP clock skew, also bounding the deletion cutoff. */
export const LOGOUT_CLOCK_TOLERANCE = 5;
export const LOGOUT_MAX_AGE = 300;

/** Verified, client-addressed Back-Channel Logout claims. At least one selector is present. */
export type VerifiedLogout = {
  issuer: string;
  /** NumericDate seconds since the Unix epoch. */
  issuedAt: number;
} & ({ sid: string; subject?: string } | { subject: string; sid?: string });

export interface SsoLogoutSessions {
  /**
   * Atomically deletes sessions with exact issuer and selectors, created at or before
   * `cutoff`. With sid, subject is an additional constraint when present; without sid,
   * subject selects every provider session for that subject. Unbound sessions are kept.
   * Returns distinct user ids only for rows actually deleted, including concurrent calls.
   */
  deleteMatching(logout: VerifiedLogout, cutoff: Date): Promise<string[]>;
}
