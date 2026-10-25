import { z } from 'zod';
import type { SettingsRepository } from '#api/domain/site/site-service';
import type { SettingsTransactions } from '#api/domain/site/settings-transactions';
import type { JobQueue } from '#api/domain/jobs/ports';
import type { MediaStorage } from '#api/domain/media/ports';
import type { Logger } from '#api/shared/logger';

const PREFIX = 'media.cleanup.';
export const MEDIA_CLEANUP_JOB = 'media.cleanup';
export const CLEANUP_MAX_ATTEMPTS = 5;
const intentSchema = z.object({
  mediaId: z.string().nullable(),
  objects: z.array(z.object({ driver: z.string(), key: z.string() })),
  /** A timed-out writer may still finish. Retain its intent across restarts until settlement is known. */
  uncertain: z.boolean(),
  attempts: z.number().int().nonnegative().default(0),
  nextAttemptAt: z.number().default(0),
});
type Intent = z.output<typeof intentSchema>;

/** Authoritative cleanup intent lives outside the expiring/scrubbed job queue. */
export class MediaCleanup {
  constructor(
    private readonly deps: {
      settings: SettingsRepository;
      transactions: SettingsTransactions;
      queue: Pick<JobQueue, 'enqueue'> & {
        pending(kind: string, id: string): Promise<boolean>;
      };
      catalog: {
        page(
          after: string,
          limit: number,
        ): Promise<{ key: string; value: unknown }[]>;
        attention(): Promise<number>;
      };
      now?: () => number;
      storage: (driver: string) => Promise<MediaStorage>;
      finalize: (id: string) => Promise<void>;
      logger: Pick<Logger, 'warn'>;
    },
  ) {}

  private async save(id: string, intent: z.input<typeof intentSchema>) {
    await this.deps.transactions.run(`${PREFIX}${id}.lock`, async (store) => {
      if (!(await store.get(PREFIX + id)))
        await store.set(PREFIX + id, intentSchema.parse(intent));
    });
  }

  async deletion(mediaId: string, objects: Intent['objects']) {
    const id = `delete.${mediaId}`;
    await this.save(id, { mediaId, objects, uncertain: false });
    await this.schedule(id);
    await this.run(id);
  }

  async rollback(
    uploadId: string,
    driver: string,
    keys: readonly string[],
    storage: MediaStorage,
  ) {
    if (!keys.length) return true;
    const id = `rollback.${uploadId}`;
    const intent = {
      mediaId: null,
      objects: keys.map((key) => ({ driver, key })),
      uncertain: storage.pendingWrites?.() ?? false,
    };
    // Persist before using the revocable adapter. Cleanup errors never discard ownership.
    await this.save(id, intent);
    try {
      await (storage.rollback ? storage.rollback(keys) : storage.remove(keys));
      await this.deps.settings.set(PREFIX + id, null);
      return true;
    } catch (error) {
      this.deps.logger.warn(`Media rollback ${id} retained for retry`, error);
      await this.schedule(id);
      if (intent.uncertain && storage.settled) {
        void storage
          .settled()
          .then(async () => {
            await this.deps.transactions.run(
              `${PREFIX}${id}.lock`,
              async (store) => {
                const raw = await store.get(PREFIX + id);
                if (raw)
                  await store.set(PREFIX + id, {
                    ...intentSchema.parse(raw),
                    uncertain: false,
                  });
              },
            );
            await this.schedule(id);
          })
          .catch((failure: unknown) =>
            this.deps.logger.warn(
              `Media rollback ${id} recovery failed`,
              failure,
            ),
          );
      }
      return false;
    }
  }

  async run(id: string) {
    const raw = await this.deps.settings.get(PREFIX + id);
    if (!raw || typeof raw !== 'object') return;
    const intent = intentSchema.parse(raw);
    const groups = new Map<string, string[]>();
    for (const { driver, key } of intent.objects) {
      const keys = groups.get(driver) ?? [];
      keys.push(key);
      groups.set(driver, keys);
    }
    for (const [driver, keys] of groups)
      await (await this.deps.storage(driver)).remove(keys);
    if (intent.mediaId) await this.deps.finalize(intent.mediaId);
    // Unknown, still-running writers can recreate objects after deletion. Keep their tombstones.
    if (!intent.uncertain) await this.deps.settings.set(PREFIX + id, null);
  }

  private async schedule(id: string) {
    return this.deps.transactions.run(`${PREFIX}${id}.lock`, async (store) => {
      const raw = await store.get(PREFIX + id);
      if (!raw) return;
      const intent = intentSchema.parse(raw);
      const now = this.deps.now?.() ?? Date.now();
      if (
        intent.attempts >= CLEANUP_MAX_ATTEMPTS ||
        intent.nextAttemptAt > now ||
        (await this.deps.queue.pending(MEDIA_CLEANUP_JOB, id))
      )
        return;
      const attempts = intent.attempts + 1;
      await store.set(PREFIX + id, {
        ...intent,
        attempts,
        nextAttemptAt: now + Math.min(3600000, 60000 * 2 ** (attempts - 1)),
      });
      await this.deps.queue.enqueue(MEDIA_CLEANUP_JOB, { id });
    });
  }

  async attention() {
    return this.deps.catalog.attention();
  }

  async recover(driver?: string) {
    const cursorKey = `${PREFIX}cursor.${driver ?? 'all'}`;
    await this.deps.transactions.run(`${cursorKey}.lock`, async (store) => {
      const after = await store.get(cursorKey);
      const entries = await this.deps.catalog.page(
        typeof after === 'string' ? after : '',
        50,
      );
      for (const { key, value } of entries) {
        const intent = intentSchema.parse(value);
        if (
          !driver ||
          intent.objects.some((object) => object.driver === driver)
        )
          await this.schedule(key.slice(PREFIX.length));
      }
      await store.set(
        cursorKey,
        entries.length === 50 ? entries.at(-1)!.key : '',
      );
    });
  }
}
