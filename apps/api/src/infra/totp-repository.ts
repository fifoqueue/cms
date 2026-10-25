import type { Database } from '#api/infra/prisma/client';
import { Prisma } from '#api/infra/prisma/generated/client';
import type {
  TotpRecord,
  TotpRepository,
  TotpMaintenanceRepository,
} from '#api/domain/auth/totp/ports';

export class PrismaTotpRepository
  implements TotpRepository, TotpMaintenanceRepository
{
  constructor(private readonly db: Pick<Database, 'totpSecret'>) {}
  async find(userId: string) {
    const row = await this.db.totpSecret.findUnique({ where: { userId } });
    return row ? { ...row, lastStep: Number(row.lastStep) } : null;
  }
  async insert(record: TotpRecord) {
    try {
      await this.db.totpSecret.create({
        data: { ...record, lastStep: BigInt(record.lastStep) },
      });
      return true;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        return false;
      throw error;
    }
  }
  async consume(id: string, step: number, resealed: string) {
    return (
      (
        await this.db.totpSecret.updateMany({
          where: { id, lastStep: { lt: BigInt(step) } },
          data: { lastStep: BigInt(step), sealedSecret: resealed },
        })
      ).count === 1
    );
  }
  async scan(afterId: string | null, limit: number) {
    const rows = await this.db.totpSecret.findMany({
      where: afterId === null ? {} : { id: { gt: afterId } },
      orderBy: { id: 'asc' },
      take: limit,
    });
    return rows.map((row) => ({ ...row, lastStep: Number(row.lastStep) }));
  }
  async reseal(id: string, expected: string, resealed: string) {
    return (
      (
        await this.db.totpSecret.updateMany({
          where: { id, sealedSecret: expected },
          data: { sealedSecret: resealed },
        })
      ).count === 1
    );
  }
  async remove(userId: string, id: string) {
    await this.db.totpSecret.deleteMany({ where: { userId, id } });
  }
}
