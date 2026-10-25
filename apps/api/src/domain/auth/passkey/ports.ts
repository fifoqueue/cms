import type {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';

/** Cryptographic ceremonies; implementation lives in infra. */
export interface WebAuthn {
  generateAuthenticationOptions: typeof generateAuthenticationOptions;
  generateRegistrationOptions: typeof generateRegistrationOptions;
  verifyAuthenticationResponse: typeof verifyAuthenticationResponse;
  verifyRegistrationResponse: typeof verifyRegistrationResponse;
}

export interface PasskeyRecord {
  id: string;
  userId: string;
  credentialId: Uint8Array<ArrayBuffer>;
  publicKey: Uint8Array<ArrayBuffer>;
  counter: number;
  transports: string[];
  deviceType: string;
  backedUp: boolean;
  discoverable: boolean;
  name: string;
  createdAt: Date;
  lastUsedAt: Date | null;
}

export interface PasskeyRepository {
  find(credentialId: Uint8Array<ArrayBuffer>): Promise<PasskeyRecord | null>;
  list(userId: string): Promise<PasskeyRecord[]>;
  /** Insert only; duplicate id or credential bytes returns false, never replaces ownership. */
  insert(record: PasskeyRecord): Promise<boolean>;
  /** Atomically insert with live user-bound token consumption and sibling-token revocation.
   * Expired/used tokens or duplicate credentials return false without any writes. */
  register(
    record: PasskeyRecord,
    tokenHash: string,
    now: Date,
  ): Promise<boolean>;
  /**
   * Atomically compare the stored counter and advance it, updating usage/backup metadata.
   * Missing, removed or stale credentials return false. Both counters may be zero for
   * authenticators without counters; the engine still consumes each challenge once.
   */
  use(
    id: string,
    previous: number,
    counter: number,
    backedUp: boolean,
    at: Date,
  ): Promise<boolean>;
  /** Idempotent, owner-scoped deletion. */
  remove(userId: string, id: string): Promise<void>;
}
