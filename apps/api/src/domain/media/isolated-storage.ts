import type { MediaStorage } from '#api/domain/media/ports';
import type { Logger } from '#api/shared/logger';
import { isolate } from '#api/shared/isolate';
import { Errors } from '#api/shared/errors';
import { z } from 'zod';

/** Revocation blocks new work; a short, key-scoped capability permits admitted-write rollback. */
export class IsolatedStorage implements MediaStorage {
  private storage?: Promise<MediaStorage>;
  private readonly writes = new Set<Promise<unknown>>();
  private readonly admitted = new Map<string, number>();
  constructor(
    private readonly id: string,
    private readonly connect: () => MediaStorage,
    private readonly active: () => boolean,
    private readonly timeoutMs: number,
    private readonly logger?: Pick<Logger, 'warn'>,
  ) {}

  private async call<T>(
    operation: string,
    task: () => Promise<T>,
    timeout = this.timeoutMs,
  ) {
    const result = await isolate(task, timeout);
    if (result.ok) return result.value;
    this.logger?.warn(
      `Media storage ${this.id} ${operation} failed`,
      result.error,
    );
    throw new Error(Errors.MediaStorageOperation);
  }

  private adapter() {
    return (this.storage ??= Promise.resolve().then(this.connect));
  }
  private guard() {
    if (!this.active()) throw new Error(Errors.PluginInactive);
  }
  pendingWrites() {
    return this.writes.size > 0;
  }
  async settled() {
    await Promise.allSettled([...this.writes]);
  }

  async commit(
    files: readonly { key: string; bytes: Uint8Array }[],
    freeBytes: number,
  ) {
    this.guard();
    const deadline = Date.now() + this.timeoutMs;
    for (const file of files)
      this.admitted.set(file.key, Date.now() + 2 * this.timeoutMs);
    const work = Promise.resolve().then(async () => {
      const storage = await this.adapter();
      this.guard();
      if (Date.now() >= deadline) throw new Error(Errors.MediaStorageOperation);
      const value = await storage.commit(structuredClone(files), freeBytes);
      this.guard();
      return z.enum(['stored', 'low_space', 'busy']).parse(value);
    });
    this.writes.add(work);
    void work.then(
      () => this.writes.delete(work),
      () => this.writes.delete(work),
    );
    return this.call('commit', () => work);
  }

  async rollback(keys: readonly string[]) {
    if (!keys.length) return;
    const deadline = Math.min(
      ...keys.map((key) => this.admitted.get(key) ?? 0),
    );
    if (Date.now() >= deadline) throw new Error(Errors.MediaStorageOperation);
    await this.call(
      'rollback',
      async () => {
        await this.settled();
        if (Date.now() >= deadline)
          throw new Error(Errors.MediaStorageOperation);
        const storage = await this.adapter();
        if (Date.now() >= deadline)
          throw new Error(Errors.MediaStorageOperation);
        await storage.remove([...keys]);
      },
      Math.max(1, deadline - Date.now()),
    );
    for (const key of keys) this.admitted.delete(key);
  }

  async remove(keys: readonly string[]) {
    this.guard();
    const deadline = Date.now() + this.timeoutMs;
    await this.call('remove', async () => {
      const storage = await this.adapter();
      this.guard();
      if (Date.now() >= deadline) throw new Error(Errors.MediaStorageOperation);
      await storage.remove([...keys]);
    });
  }

  async read(key: string, range?: { start: number; end?: number }) {
    this.guard();
    const deadline = Date.now() + this.timeoutMs;
    const file = await this.call('read', async () => {
      const storage = await this.adapter();
      this.guard();
      if (Date.now() >= deadline) throw new Error(Errors.MediaStorageOperation);
      return z
        .object({
          body: z.instanceof(ReadableStream),
          size: z.number().int().nonnegative(),
          start: z.number().int().nonnegative(),
          end: z.number().int().min(-1),
        })
        .nullable()
        .parse(await storage.read(key, range));
    });
    if (!file) return null;
    const reader = await this.call('reader', async () => file.body.getReader());
    const body = new ReadableStream<Uint8Array>({
      pull: async (controller) => {
        try {
          this.guard();
          const chunk = await this.call('stream', async () => {
            const value = await reader.read();
            return value.done
              ? null
              : z.instanceof(Uint8Array).parse(value.value);
          });
          if (chunk === null) controller.close();
          else controller.enqueue(chunk);
        } catch (error) {
          controller.error(error);
          await this.call('cancel', () => reader.cancel()).catch(
            () => undefined,
          );
        }
      },
      cancel: () => this.call('cancel', () => reader.cancel()),
    });
    return { ...file, body };
  }
}
