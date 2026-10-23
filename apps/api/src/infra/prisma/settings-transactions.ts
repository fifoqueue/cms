import type {
  SettingsTransaction,
  SettingsTransactions,
} from '#api/domain/site/settings-transactions';
import type { Database } from '#api/infra/prisma/client';
import { lockSetting } from '#api/infra/prisma/client';
import { PrismaSettingsRepository } from '#api/infra/prisma/settings-repository';

/** Shared row lock, current reads and mutations on one connection; failures roll back. */
export class PrismaSettingsTransactions implements SettingsTransactions {
  constructor(private readonly db: Database) {}

  run<T>(lock: string, task: (settings: SettingsTransaction) => Promise<T>) {
    return this.db.$transaction(async (tx) => {
      await lockSetting(tx, lock);
      return task(new PrismaSettingsRepository(tx));
    });
  }
}
