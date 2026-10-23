import type { SettingsRepository } from '#api/domain/site/site-service';

export interface SettingsTransaction extends SettingsRepository {
  /** Counts JSON object records under a literal prefix, excluding null tombstones. */
  count(prefix: string): Promise<number>;
}

/** All writers of a protected setting group must use the same lock and the scoped store. */
export interface SettingsTransactions {
  run<T>(
    lock: string,
    task: (settings: SettingsTransaction) => Promise<T>,
  ): Promise<T>;
}
