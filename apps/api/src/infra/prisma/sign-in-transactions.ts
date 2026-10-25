import { z } from 'zod';
import { SIGN_IN_STAGES } from '#api/domain/auth/sign-in-transactions';
import type {
  SignInTransaction,
  SignInTransactions,
} from '#api/domain/auth/sign-in-transactions';
import type { AdmissionLimits } from '#api/domain/auth/sso-ports';
import type { Database } from '#api/infra/prisma/client';
import { lockSetting } from '#api/infra/prisma/client';
import { signInStateSchema } from '#api/domain/auth/sign-in-state';

export class PrismaSignInTransactions implements SignInTransactions {
  constructor(private readonly db: Database) {}

  admit(record: SignInTransaction, now: Date, limits: AdmissionLimits) {
    const state = JSON.stringify(signInStateSchema.parse(record.state ?? null));
    return this.db.$transaction(async (tx) => {
      await lockSetting(tx, 'signIn.transactions');
      await tx.signInTransaction.deleteMany({
        where: { expiresAt: { lte: now } },
      });
      if (record.expiresAt <= now) return false;
      if (
        await tx.signInTransaction.findUnique({
          where: { handleHash: record.handleHash },
        })
      )
        return false;
      if ((await tx.signInTransaction.count()) >= limits.total) return false;
      if (
        (await tx.signInTransaction.count({
          where: { clientKey: record.clientKey },
        })) >= limits.perClient
      )
        return false;
      await tx.signInTransaction.create({
        data: { ...record, state },
      });
      return true;
    });
  }

  async take(
    handleHash: string,
    clientKey: string,
    now: Date,
  ): Promise<SignInTransaction | null> {
    const row = await this.acquire(handleHash, clientKey, now);
    return row && (await this.replace(handleHash, null, now)) ? row : null;
  }

  async acquire(
    handleHash: string,
    clientKey: string,
    now: Date,
  ): Promise<SignInTransaction | null> {
    const where = { handleHash, clientKey, expiresAt: { gt: now } };
    const { count } = await this.db.signInTransaction.updateMany({
      where: { ...where, inProgress: false },
      data: { inProgress: true },
    });
    if (count !== 1) return null;
    const row = await this.db.signInTransaction.findFirst({ where });
    if (!row) return null;
    return {
      handleHash: row.handleHash,
      stage: z.enum(SIGN_IN_STAGES).parse(row.stage),
      methodId: row.methodId,
      factorId: row.factorId,
      userId: row.userId,
      setupTokenHash: row.setupTokenHash,
      identityId: row.identityId,
      clientKey: row.clientKey,
      expiresAt: row.expiresAt,
      state: signInStateSchema.parse(JSON.parse(row.state)),
    };
  }

  async release(handleHash: string, now: Date) {
    await this.db.signInTransaction.deleteMany({
      where: { handleHash, expiresAt: { lte: now } },
    });
    await this.db.signInTransaction.updateMany({
      where: { handleHash, inProgress: true },
      data: { inProgress: false },
    });
  }

  async replace(handleHash: string, next: SignInTransaction | null, now: Date) {
    const state = next
      ? JSON.stringify(signInStateSchema.parse(next.state ?? null))
      : null;
    return this.db.$transaction(async (tx) => {
      await lockSetting(tx, 'signIn.transactions');
      if (next && next.expiresAt <= now) return false;
      const { count } = await tx.signInTransaction.deleteMany({
        where: { handleHash, inProgress: true, expiresAt: { gt: now } },
      });
      if (count !== 1) return false;
      if (next)
        await tx.signInTransaction.create({
          data: { ...next, state: state!, inProgress: false },
        });
      return true;
    });
  }
}
