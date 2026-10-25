import { isolate } from '#api/shared/isolate';
import { invalidInput, Errors } from '#api/shared/errors';

/** Resolve bounded batches before entering the store's collision-checked transaction. */
export const regeneratePaths = async <T, R>(
  port: {
    load(): Promise<T[]>;
    resolve(item: T): Promise<R>;
    commit(items: T[], results: R[]): Promise<void>;
    progress(count: number): void;
  },
  budgetMs = 5000,
) => {
  for (;;) {
    const items = await port.load();
    if (!items.length) return;
    if (items.length > 200) throw invalidInput(Errors.InvalidInput);
    const result = await isolate(
      () => Promise.all(items.map((item) => port.resolve(item))),
      budgetMs,
    );
    if (!result.ok) throw result.error;
    await port.commit(items, result.value);
    port.progress(items.length);
  }
};
