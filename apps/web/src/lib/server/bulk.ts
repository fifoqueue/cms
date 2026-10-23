import { CmsApiError } from '@cms/sdk/client';
import { Errors } from '#lib/server/errors.js';

/** One item a bulk action could not change, with a message safe to show. */
export interface BulkFailure {
  id: string;
  message: string;
}

/** Bulk work runs this many API calls at once. */
const CONCURRENCY = 4;

/**
 * Runs `task` for every id, a few at a time, and collects the failures instead of stopping at the
 * first. A task may return a catalog message to fail its item; API rejections (4xx) keep their
 * message; anything else is reported generically.
 */
export const eachBounded = async (
  ids: readonly string[],
  task: (id: string) => Promise<string | void>,
): Promise<{ done: number; failed: BulkFailure[] }> => {
  const failed: BulkFailure[] = [];
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < ids.length) {
      const id = ids[next++]!;
      try {
        const problem = await task(id);
        if (problem) failed.push({ id, message: problem });
        else done++;
      } catch (caught) {
        failed.push({
          id,
          message:
            caught instanceof CmsApiError && caught.status < 500
              ? caught.message
              : Errors.BulkItemFailed,
        });
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, ids.length) }, worker),
  );
  return { done, failed };
};

/** The distinct ids a bulk form submitted, at most `limit`. */
export const formIds = (form: FormData, limit = 100) =>
  [
    ...new Set(
      form
        .getAll('ids')
        .filter(
          (id): id is string =>
            typeof id === 'string' && id !== '' && id.length <= 36,
        ),
    ),
  ].slice(0, limit);

/** `Promise.all(items.map(task))` with at most `CONCURRENCY` calls at once, in input order. */
export const mapBounded = async <T, R>(
  items: readonly T[],
  task: (item: T) => Promise<R>,
): Promise<R[]> => {
  const results: R[] = [];
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await task(items[index]!);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker),
  );
  return results;
};
