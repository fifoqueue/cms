import type {
  TotpRecord,
  TotpRepository,
  TotpMaintenanceRepository,
} from '#api/domain/auth/totp/ports';

export class MemoryTotpSecrets
  implements TotpRepository, TotpMaintenanceRepository
{
  readonly rows = new Map<string, TotpRecord>();
  async find(userId: string) {
    const row = [...this.rows.values()].find((row) => row.userId === userId);
    return row ? structuredClone(row) : null;
  }
  async insert(record: TotpRecord) {
    if (
      this.rows.has(record.id) ||
      [...this.rows.values()].some((row) => row.userId === record.userId)
    )
      return false;
    this.rows.set(record.id, structuredClone(record));
    return true;
  }
  async consume(id: string, step: number, resealed: string) {
    const row = this.rows.get(id);
    if (!row || row.lastStep >= step) return false;
    this.rows.set(id, { ...row, lastStep: step, sealedSecret: resealed });
    return true;
  }
  async scan(afterId: string | null, limit: number) {
    return structuredClone(
      [...this.rows.values()]
        .filter((row) => afterId === null || row.id > afterId)
        .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
        .slice(0, limit),
    );
  }
  async reseal(id: string, expected: string, resealed: string) {
    const row = this.rows.get(id);
    if (!row || row.sealedSecret !== expected) return false;
    this.rows.set(id, { ...row, sealedSecret: resealed });
    return true;
  }
  async remove(userId: string, id: string) {
    if (this.rows.get(id)?.userId === userId) this.rows.delete(id);
  }
}
