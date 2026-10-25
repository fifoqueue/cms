import type { MediaResync } from '@cms/sdk';
import { mediaResyncSchema } from '@cms/sdk';
import type { SettingsRepository } from '#api/domain/site/site-service';
import type { SettingsTransactions } from '#api/domain/site/settings-transactions';
import type { JobQueue, TaskLeases } from '#api/domain/jobs/ports';
import type { Clock, IdGenerator } from '#api/domain/ports';
import { Errors, rateLimited } from '#api/shared/errors';

const KEY = 'media.storage.resync';
export const MEDIA_RESYNC_JOB = 'media.storage.resync';
type Counts = Pick<
  MediaResync,
  'scanned' | 'refreshed' | 'missing' | 'untracked'
>;

/** A durable, single-flight inventory job. Never run by a library read. */
export class StorageResync {
  constructor(
    private readonly deps: {
      settings: SettingsRepository;
      transactions: SettingsTransactions;
      queue: JobQueue;
      leases: TaskLeases;
      clock: Clock;
      ids: IdGenerator;
      driver: () => Promise<string>;
      recoverCleanup?: () => Promise<void>;
      cleanupAttention?: () => Promise<number>;
      reconcile: (
        driver: 'local' | 's3',
        startedAt: Date,
        signal: AbortSignal,
      ) => Promise<Counts>;
    },
  ) {}

  async status() {
    const raw = await this.deps.settings.get(KEY);
    return raw
      ? mediaResyncSchema.parse({
          ...mediaResyncSchema.parse(raw),
          cleanupNeedsAttention: (await this.deps.cleanupAttention?.()) ?? 0,
        })
      : null;
  }

  async enqueue() {
    return this.deps.transactions.run(`${KEY}.lock`, async (store) => {
      const raw = await store.get(KEY);
      const current = raw ? mediaResyncSchema.parse(raw) : null;
      if (current && ['queued', 'running'].includes(current.status))
        return current;
      const now = this.deps.clock.now();
      if (current && now.getTime() - Date.parse(current.startedAt) < 60_000)
        throw rateLimited(Errors.MediaStorageBusy);
      const state: MediaResync = {
        cleanupNeedsAttention: (await this.deps.cleanupAttention?.()) ?? 0,
        id: this.deps.ids.next(),
        driver: await this.deps.driver(),
        status: 'queued',
        startedAt: now.toISOString(),
        finishedAt: null,
        scanned: 0,
        refreshed: 0,
        missing: 0,
        untracked: 0,
        error: null,
      };
      await store.set(KEY, state);
      await this.deps.recoverCleanup?.();
      await this.deps.queue.enqueue(MEDIA_RESYNC_JOB, { id: state.id });
      return state;
    });
  }

  async run(payload: unknown) {
    const id = (payload as { id?: unknown } | null)?.id;
    await this.deps.leases.ensure(KEY);
    const owner = this.deps.ids.next();
    if (
      !(await this.deps.leases.claim(
        KEY,
        owner,
        120_000,
        this.deps.clock.now(),
        { ignoreDue: true },
      ))
    )
      return;
    const controller = new AbortController();
    const signal = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(60_000),
    ]);
    let renewal = Promise.resolve();
    const timer = setInterval(() => {
      renewal = renewal
        .then(async () => {
          if (
            !(await this.deps.leases.extend(
              KEY,
              owner,
              120_000,
              this.deps.clock.now(),
            ))
          )
            controller.abort(new Error(Errors.MediaStorageBusy));
        })
        .catch((error: unknown) => controller.abort(error));
    }, 20_000);
    try {
      const state = await this.status();
      if (!state) return;
      if (
        state.id !== id ||
        state.status === 'completed' ||
        state.status === 'failed'
      )
        return;
      state.status = 'running';
      await this.deps.settings.set(KEY, state);
      try {
        if (state.driver !== 'local' && state.driver !== 's3')
          throw new Error(Errors.MediaDriverInvalid);
        Object.assign(
          state,
          await this.deps.reconcile(
            state.driver,
            new Date(state.startedAt),
            signal,
          ),
        );
        state.status = 'completed';
      } catch {
        state.status = 'failed';
        state.error = Errors.MediaResyncFailed;
      }
      state.finishedAt = this.deps.clock.now().toISOString();
      await this.deps.settings.set(KEY, state);
    } finally {
      clearInterval(timer);
      await renewal;
      await this.deps.leases.release(KEY, owner, this.deps.clock.now(), null);
    }
  }
}
