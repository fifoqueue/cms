import { fail } from '@sveltejs/kit';
import { CmsApiError } from '@cms/sdk/client';
import { mapLimit } from '#lib/server/bounded.js';
import type { IssueParams } from '@cms/sdk';
import { Errors, safeIssues, type FormFailure } from '#lib/server/errors.js';

/** One item a bulk action could not change, with a message safe to show. */
export interface BulkFailure {
  id: string;
  message: string;
  /** Values the catalog message leaves out. */
  params?: IssueParams;
}

/** What a task reports for an item it could not change: a catalog message and its values. */
export type BulkProblem = string | { message: string; params?: IssueParams };

/**
 * Runs `task` for every id, a few at a time, and collects the failures instead of stopping at the
 * first. A task may return a catalog message to fail its item; API rejections (4xx) keep their
 * message; anything else is reported generically.
 */
export const eachBounded = async (
  ids: readonly string[],
  task: (id: string) => Promise<BulkProblem | void>,
  /** Selected ids that were not valid for the action; reported, never run. */
  invalid: readonly string[] = [],
): Promise<{ done: number; failed: BulkFailure[] }> => {
  const failed: BulkFailure[] = invalid.map((id) => ({
    id: id.slice(0, 100),
    message: Errors.BulkItemInvalid,
  }));
  let done = 0;
  await mapLimit(ids, async (id) => {
    try {
      const problem = await task(id);
      if (typeof problem === 'string') failed.push({ id, message: problem });
      else if (problem) failed.push({ id, ...problem });
      else done++;
    } catch (caught) {
      if (caught instanceof CmsApiError && caught.status < 500) {
        // The refusal's own values travel on its issue with an empty path.
        const params = safeIssues(caught.issues)?.find(
          (issue) => issue.path === '' && issue.message === caught.message,
        )?.params;
        failed.push({ id, message: caught.message, ...(params && { params }) });
      } else failed.push({ id, message: Errors.BulkItemFailed });
    }
  });
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
      failure: fail(400, {
        message: Errors.BulkTooMany,
        issues: [
          {
            path: '',
            message: Errors.BulkTooMany,
            params: { limit: BULK_LIMIT },
          },
        ],
      } satisfies FormFailure),
    } as const;
  return {
    ids: ids.filter(valid),
    invalid: ids.filter((id) => !valid(id)),
  } as const;
};

/** `Promise.all(items.map(task))` with at most `CONCURRENCY` calls at once, in input order. */
export const mapBounded = <T, R>(
  items: readonly T[],
  task: (item: T) => Promise<R>,
): Promise<R[]> => mapLimit(items, task);
