import type {
  PasskeyRecord,
  PasskeyRepository,
} from '#api/domain/auth/passkey/ports';

export class MemoryPasskeys implements PasskeyRepository {
  readonly rows = new Map<string, PasskeyRecord>();
  readonly tokens = new Map<string, { userId: string; expiresAt: Date }>();
  async find(credentialId: Uint8Array<ArrayBuffer>) {
    const row = [...this.rows.values()].find((row) =>
      Buffer.from(row.credentialId).equals(credentialId),
    );
    return row ? structuredClone(row) : null;
  }
  async list(userId: string) {
    return structuredClone(
      [...this.rows.values()]
        .filter((row) => row.userId === userId)
        .sort(
          (a, b) =>
            a.createdAt.getTime() - b.createdAt.getTime() ||
            a.id.localeCompare(b.id),
        ),
    );
  }
  async insert(record: PasskeyRecord) {
    return this.add(record);
  }
  private add(record: PasskeyRecord) {
    if (
      this.rows.has(record.id) ||
      [...this.rows.values()].some((row) =>
        Buffer.from(row.credentialId).equals(record.credentialId),
      )
    )
      return false;
    this.rows.set(record.id, structuredClone(record));
    return true;
  }
  async register(record: PasskeyRecord, tokenHash: string, now: Date) {
    const token = this.tokens.get(tokenHash);
    if (!token || token.userId !== record.userId || token.expiresAt <= now)
      return false;
    if (!this.add(record)) return false;
    for (const [hash, row] of this.tokens)
      if (row.userId === record.userId) this.tokens.delete(hash);
    return true;
  }
  async use(
    id: string,
    previous: number,
    counter: number,
    backedUp: boolean,
    at: Date,
  ) {
    const row = this.rows.get(id);
    if (
      !row ||
      row.counter !== previous ||
      counter < previous ||
      (previous > 0 && counter === previous)
    )
      return false;
    this.rows.set(id, { ...row, counter, backedUp, lastUsedAt: new Date(at) });
    return true;
  }
  async remove(userId: string, id: string) {
    if (this.rows.get(id)?.userId === userId) this.rows.delete(id);
  }
}
