import type { AdmissionLimits } from '#api/domain/auth/sso-ports';

export const SIGN_IN_TTL_MS = 10 * 60 * 1000;
export const SIGN_IN_STAGES = [
  'primary',
  'secondFactor',
  'enroll',
  'setup',
  'account',
] as const;

export interface SignInTransaction {
  handleHash: string;
  stage: (typeof SIGN_IN_STAGES)[number];
  methodId: string;
  factorId: string | null;
  userId: string | null;
  setupTokenHash: string | null;
  /** Core-only SSO session binding; pending requests cascade when the identity is unlinked. */
  identityId?: string | null;
  /** JSON validated at the extension boundary; at most 8 KB UTF-8. */
  state: unknown;
  clientKey: string;
  expiresAt: Date;
}

export interface SignInTransactions {
  /** Reserve one live handle without freeing its admission slot. At most one worker wins. */
  acquire(
    handleHash: string,
    clientKey: string,
    now: Date,
  ): Promise<SignInTransaction | null>;
  /** A failed attempt unlocks the same handle; expired records are removed instead. */
  release(handleHash: string, now: Date): Promise<void>;
  /** Commit a reserved step: rotate within its existing slot, or consume a terminal step. */
  replace(
    handleHash: string,
    next: SignInTransaction | null,
    now: Date,
  ): Promise<boolean>;
  /** Atomically purge expired rows, enforce both limits, then insert. */
  admit(
    record: SignInTransaction,
    now: Date,
    limits: AdmissionLimits,
  ): Promise<boolean>;
  /** Consume only a live, client-bound record; concurrent callers obtain it at most once. */
  take(
    handleHash: string,
    clientKey: string,
    now: Date,
  ): Promise<SignInTransaction | null>;
}
