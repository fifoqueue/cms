import {
  DATABASE_CLEANUP_AUTOSAVE_DAYS,
  databaseCleanupCategorySchema,
  databaseCleanupInputSchema,
  databaseCleanupOptionsSchema,
} from '@cms/sdk';
import type {
  DatabaseCleanupCategory,
  DatabaseCleanupCounts,
  DatabaseCleanupPreview,
  DatabaseCleanupResult,
  DatabaseTableSize,
} from '@cms/sdk';
import { authorize } from '#api/domain/auth/authorization';
import type { Actor } from '#api/domain/auth/authorization';
import type { TaskLeases } from '#api/domain/jobs/ports';
import type { Clock, IdGenerator } from '#api/domain/ports';
import { conflict, Errors } from '#api/shared/errors';
import { parseInput } from '#api/shared/validation';

export interface CleanupPolicy {
  keepLatest: number;
  /** Fixed at the start of the request, not advanced between batches. */
  now: Date;
  autosavesBefore: Date;
}

export type CleanupCategory = Exclude<DatabaseCleanupCategory, 'optimize'>;

/**
 * Read-only inventory and bounded maintenance. A batch returns the actual number deleted.
 * Revision batches must take the content write lock and check the authorized content
 * snapshot; neither content nor its text-save watermark may be updated.
 * Content/comment batches must use their domain permanent-delete paths, not raw deletes.
 * Return zero only when no eligible work remains.
 */
export interface DatabaseCleanupStore {
  counts(policy: CleanupPolicy): Promise<DatabaseCleanupCounts>;
  tables(): Promise<DatabaseTableSize[]>;
  batch(
    category: CleanupCategory,
    policy: CleanupPolicy,
    actor: Actor,
    limit: number,
  ): Promise<number>;
  /** Identifier must come from the adapter's schema whitelist, never the caller. */
  optimize(table: string): Promise<void>;
}

const LEASE_NAME = 'tools.database-cleanup';
const LEASE_MS = 5 * 60 * 1000;
const BATCH_SIZE = 100;

const emptyCounts = (): DatabaseCleanupCounts => ({
  revisions: 0,
  autosaves: 0,
  trashedContent: 0,
  spamComments: 0,
  trashedComments: 0,
  expired: 0,
  optimize: 0,
});

export class DatabaseCleanupService {
  constructor(
    private readonly deps: {
      store: DatabaseCleanupStore;
      leases: TaskLeases;
      clock: Clock;
      ids: IdGenerator;
    },
  ) {}

  async preview(input: unknown, actor: Actor): Promise<DatabaseCleanupPreview> {
    authorize(actor, 'tools.manage');
    const options = parseInput(databaseCleanupOptionsSchema, input);
    const policy = this.policy(options.keepLatest);
    const counts = await this.deps.store.counts(policy);
    const tables = await this.deps.store.tables();
    return { counts, tables, options };
  }

  async run(input: unknown, actor: Actor): Promise<DatabaseCleanupResult> {
    authorize(actor, 'tools.manage');
    const { categories, options } = parseInput(
      databaseCleanupInputSchema,
      input,
    );
    const { leases, clock, store } = this.deps;
    const owner = this.deps.ids.next();
    await leases.ensure(LEASE_NAME);
    if (
      !(await leases.claim(LEASE_NAME, owner, LEASE_MS, clock.now(), {
        ignoreDue: true,
      }))
    )
      throw conflict(Errors.DatabaseCleanupBusy);

    let lost = false;
    let pending = Promise.resolve();
    const renew = async () => {
      if (!(await leases.extend(LEASE_NAME, owner, LEASE_MS, clock.now())))
        throw conflict(Errors.DatabaseCleanupBusy);
    };
    const timer = setInterval(() => {
      pending = pending.then(renew).catch(() => {
        lost = true;
      });
    }, LEASE_MS / 5);
    const guard = async () => {
      await pending;
      if (lost) throw conflict(Errors.DatabaseCleanupBusy);
      await renew();
    };
    try {
      const policy = this.policy(options.keepLatest);
      const deleted = emptyCounts();
      let optimization: DatabaseCleanupResult['optimization'] = null;
      // Deterministic order: dependent rows first, table maintenance last.
      for (const category of databaseCleanupCategorySchema.options) {
        if (!categories.includes(category) || category === 'optimize') continue;
        for (;;) {
          await guard();
          const count = await store.batch(category, policy, actor, BATCH_SIZE);
          deleted[category] += count;
          if (!count) break;
        }
      }
      if (categories.includes('optimize')) {
        const before = await store.tables();
        for (const { table } of before) {
          await guard();
          await store.optimize(table);
        }
        optimization = { before, after: await store.tables() };
      }
      await guard();
      return { deleted, optimization };
    } finally {
      clearInterval(timer);
      await pending;
      await leases.release(LEASE_NAME, owner, clock.now(), null);
    }
  }

  private policy(keepLatest: number): CleanupPolicy {
    const now = this.deps.clock.now();
    return {
      keepLatest,
      now,
      autosavesBefore: new Date(
        now.getTime() - DATABASE_CLEANUP_AUTOSAVE_DAYS * 86400000,
      ),
    };
  }
}
