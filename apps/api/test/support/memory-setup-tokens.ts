import type { SetupToken, SetupTokens } from '#api/domain/auth/setup-tokens';

export class MemorySetupTokens implements SetupTokens {
  readonly rows = new Map<string, SetupToken>();

  async find(tokenHash: string, now: Date) {
    const row = this.rows.get(tokenHash);
    return row && row.expiresAt > now ? structuredClone(row) : null;
  }

  async consume(tokenHash: string, userId: string, now: Date) {
    const row = this.rows.get(tokenHash);
    if (!row || row.userId !== userId || row.expiresAt <= now) return false;
    return this.rows.delete(tokenHash);
  }
}
