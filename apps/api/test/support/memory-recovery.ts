import type {
  RecoveryCodeRecord,
  RecoveryCodeRepository,
} from '#api/domain/auth/recovery-service';

export class MemoryRecoveryCodes implements RecoveryCodeRepository {
  readonly rows = new Map<string, RecoveryCodeRecord>();
  async status(userId: string) {
    const codes = [...this.rows.values()].filter(
      (row) => row.userId === userId,
    );
    return {
      remaining: codes.length,
      createdAt: codes[0]?.createdAt.toISOString() ?? null,
    };
  }
  async replace(userId: string, codes: RecoveryCodeRecord[]) {
    for (const [hash, code] of this.rows)
      if (code.userId === userId) this.rows.delete(hash);
    for (const code of codes)
      this.rows.set(code.codeHash, structuredClone(code));
  }
  async consume(userId: string, codeHash: string) {
    if (this.rows.get(codeHash)?.userId !== userId) return false;
    this.rows.delete(codeHash);
    return true;
  }
}
