import type { Awaitable } from '@cms/sdk';
import { Errors } from '#api/shared/errors';

export type Isolated<T> = { ok: true; value: T } | { ok: false; error: Error };

/**
 * Runs extension code so that it can neither throw into core nor block it for longer than `timeoutMs`.
 * shortcut: synchronous infinite loops still block the event loop; move plugins to Workers if that matters.
 */
export const isolate = async <T>(
  task: () => Awaitable<T>,
  timeoutMs: number,
): Promise<Isolated<T>> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(Errors.PluginTimedOut(timeoutMs))),
      timeoutMs,
    );
  });
  try {
    return {
      ok: true,
      value: await Promise.race([Promise.resolve().then(task), timeout]),
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  } finally {
    clearTimeout(timer);
  }
};
