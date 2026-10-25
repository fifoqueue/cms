export interface TotpRecord {
  id: string;
  userId: string;
  sealedSecret: string;
  lastStep: number;
  createdAt: Date;
}

export interface TotpRepository {
  find(userId: string): Promise<TotpRecord | null>;
  /** Insert only. Duplicate user/id returns false, never replaces an existing factor. */
  insert(record: TotpRecord): Promise<boolean>;
  /** Atomically advance lastStep and re-seal only if the step is newer; missing ids fail. */
  consume(id: string, step: number, resealed: string): Promise<boolean>;
  /** Idempotent and owner scoped. */
  remove(userId: string, id: string): Promise<void>;
}

/** Maintenance reads bounded pages, never changing replay counters or resurrecting removed rows. */
export interface TotpMaintenanceRepository {
  /** Strictly ascending id order, exclusive cursor. */
  scan(afterId: string | null, limit: number): Promise<TotpRecord[]>;
  /** Compare-and-swap ciphertext; stale or removed rows return false. */
  reseal(id: string, expected: string, resealed: string): Promise<boolean>;
}

export interface TotpAlgorithm {
  /** Cryptographically random 20 bytes, encoded as unpadded base32. */
  secret(): string;
  /** SHA-1, six digits, 30s, ±1 step. Constant-time comparisons; returns the matched step. */
  match(secret: string, code: string, now: Date): number | null;
}
