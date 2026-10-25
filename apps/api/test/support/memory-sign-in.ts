import type { AdmissionLimits } from '#api/domain/auth/sso-ports';
import { signInStateSchema } from '#api/domain/auth/sign-in-state';
import type {
  SignInTransaction,
  SignInTransactions,
} from '#api/domain/auth/sign-in-transactions';

export class MemorySignInTransactions implements SignInTransactions {
  readonly rows = new Map<string, SignInTransaction>();
  private readonly busy = new Set<string>();

  async admit(record: SignInTransaction, now: Date, limits: AdmissionLimits) {
    const state = signInStateSchema.parse(record.state ?? null);
    for (const [key, row] of this.rows)
      if (row.expiresAt <= now) {
        this.rows.delete(key);
        this.busy.delete(key);
      }
    if (record.expiresAt <= now || this.rows.has(record.handleHash))
      return false;
    if (this.rows.size >= limits.total) return false;
    if (
      [...this.rows.values()].filter(
        (row) => row.clientKey === record.clientKey,
      ).length >= limits.perClient
    )
      return false;
    this.rows.set(record.handleHash, structuredClone({ ...record, state }));
    return true;
  }

  async take(handleHash: string, clientKey: string, now: Date) {
    const row = await this.acquire(handleHash, clientKey, now);
    return row && (await this.replace(handleHash, null, now)) ? row : null;
  }

  async acquire(handleHash: string, clientKey: string, now: Date) {
    const row = this.rows.get(handleHash);
    if (
      !row ||
      this.busy.has(handleHash) ||
      row.clientKey !== clientKey ||
      row.expiresAt <= now
    )
      return null;
    this.busy.add(handleHash);
    return structuredClone(row);
  }

  async release(handleHash: string, now: Date) {
    this.busy.delete(handleHash);
    const row = this.rows.get(handleHash);
    if (row && row.expiresAt <= now) this.rows.delete(handleHash);
  }

  async replace(handleHash: string, next: SignInTransaction | null, now: Date) {
    const state = next ? signInStateSchema.parse(next.state ?? null) : null;
    const row = this.rows.get(handleHash);
    if (
      !row ||
      !this.busy.has(handleHash) ||
      row.expiresAt <= now ||
      (next && next.expiresAt <= now)
    )
      return false;
    this.busy.delete(handleHash);
    this.rows.delete(handleHash);
    if (next)
      this.rows.set(next.handleHash, structuredClone({ ...next, state }));
    return true;
  }
}
