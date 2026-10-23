import { fail } from '@sveltejs/kit';
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
  /** Selected ids that were not valid for the action; reported, never run. */
  invalid: readonly string[] = [],
): Promise<{ done: number; failed: BulkFailure[] }> => {
  const failed: BulkFailure[] = invalid.map((id) => ({
    id: id.slice(0, 100),
    message: Errors.BulkItemInvalid,
  }));
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

/** Most items one bulk action may name. */
export const BULK_LIMIT = 100;

/** Content entries and users have UUIDs. */
export const isRecordId = (id: string) => id.length <= 36;

/**
 * The distinct ids a bulk form submitted, split into ids the domain accepts (`valid`) and the
 * rest, which are reported as failed rather than dropped. More than `BULK_LIMIT` is refused
 * before anything changes.
 */
export const readSelection = (
  form: FormData,
  valid: (id: string) => boolean = isRecordId,
) => {
  const ids = [
    ...new Set(
      form
        .getAll('ids')
        .filter((id): id is string => typeof id === 'string' && id !== ''),
    ),
  ];
  if (ids.length > BULK_LIMIT)
    return {
      failure: fail(400, { message: Errors.BulkTooMany(BULK_LIMIT) }),
    } as const;
  return {
    ids: ids.filter(valid),
    invalid: ids.filter((id) => !valid(id)),
  } as const;
};

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
