import { z } from 'zod';
import type { Database } from '#api/infra/prisma/client';
import { Prisma } from '#api/infra/prisma/generated/client';
import type {
  PasskeyRecord,
  PasskeyRepository,
} from '#api/domain/auth/passkey/ports';

export class PrismaPasskeyRepository implements PasskeyRepository {
  constructor(
    private readonly db: Pick<Database, 'passkey' | '$transaction'>,
  ) {}
  private record(
    row: Omit<PasskeyRecord, 'counter' | 'transports'> & {
      counter: bigint;
      transports: string;
    },
  ): PasskeyRecord {
    return {
      ...row,
      counter: Number(row.counter),
      transports: z.array(z.string()).parse(JSON.parse(row.transports)),
    };
  }
  async find(credentialId: Uint8Array<ArrayBuffer>) {
    const row = await this.db.passkey.findUnique({ where: { credentialId } });
    return row ? this.record(row) : null;
  }
  async list(userId: string) {
    return (
      await this.db.passkey.findMany({
        where: { userId },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      })
    ).map((row) => this.record(row));
  }
  async insert(record: PasskeyRecord) {
    try {
      await this.db.passkey.create({
        data: {
          ...record,
          counter: BigInt(record.counter),
          transports: JSON.stringify(record.transports),
        },
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
  async use(
    id: string,
    previous: number,
    counter: number,
    backedUp: boolean,
    at: Date,
  ) {
    if (counter < previous || (previous > 0 && counter === previous))
      return false;
    const result = await this.db.passkey.updateMany({
      where: { id, counter: BigInt(previous) },
      data: { counter: BigInt(counter), backedUp, lastUsedAt: at },
    });
    return result.count === 1;
  }
  async register(record: PasskeyRecord, tokenHash: string, now: Date) {
    try {
      return await this.db.$transaction(async (tx) => {
        const { count } = await tx.passwordToken.deleteMany({
          where: { tokenHash, userId: record.userId, expiresAt: { gt: now } },
        });
        if (count !== 1) return false;
        await tx.passkey.create({
          data: {
            ...record,
            counter: BigInt(record.counter),
            transports: JSON.stringify(record.transports),
          },
        });
        await tx.passwordToken.deleteMany({ where: { userId: record.userId } });
        return true;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        return false;
      throw error;
    }
  }
  async remove(userId: string, id: string) {
    await this.db.passkey.deleteMany({ where: { userId, id } });
  }
}
