import type { Awaitable } from '@cms/sdk';
import type {
  ActionHandler,
  ActionHookMap,
  ActionName,
  FilterHandler,
  FilterHookMap,
  FilterName,
  HookRegistrar,
  Unsubscribe,
} from '@cms/sdk/plugin';
import type { HookDispatcher } from '#api/domain/ports';
import { isolate } from '#api/shared/isolate';
import type { Logger } from '#api/shared/logger';

type Handler = (value: unknown) => Awaitable<unknown>;

interface Registration {
  owner: string;
  handler: Handler;
  priority: number;
  sequence: number;
  /** Core handlers run directly: no isolation or timeout, and their errors propagate. */
  core: boolean;
}

/**
 * A core-owned copy of an accepted filter result, so the plugin cannot change it after
 * validation through a reference it kept. A throwing validator or copy counts as invalid.
 */
const snapshot = (
  value: unknown,
  accept: (value: unknown) => boolean,
): { value: unknown } | undefined => {
  try {
    return accept(value) ? { value: structuredClone(value) } : undefined;
  } catch {
    return undefined;
  }
};

export interface HookBusOptions {
  timeoutMs: number;
  logger: Logger;
}

/**
 * Hook registry and dispatcher. Every handler gets a copy of the value. Plugin handlers run
 * isolated and are skipped (with a warning) when they throw, time out or return an invalid
 * value. Core action handlers (`core`) run directly and are awaited; a failure is logged as a
 * core error and rejects `emit`.
 */
export class HookBus implements HookDispatcher {
  private readonly actions = new Map<string, Registration[]>();
  private readonly filters = new Map<string, Registration[]>();
  private sequence = 0;

  constructor(private readonly options: HookBusOptions) {}

  registrar(owner: string): HookRegistrar {
    return {
      on: <K extends ActionName>(name: K, handler: ActionHandler<K>) =>
        this.register(this.actions, name, owner, handler as Handler, 0),
      filter: <K extends FilterName>(
        name: K,
        handler: FilterHandler<K>,
        priority = 10,
      ) =>
        this.register(this.filters, name, owner, handler as Handler, priority),
    };
  }

  /**
   * Core action subscriptions; for the composition root only, never handed to plugins.
   * Handlers are awaited by `emit` without isolation or timeout.
   */
  core(owner: string): Pick<HookRegistrar, 'on'> {
    return {
      on: <K extends ActionName>(name: K, handler: ActionHandler<K>) =>
        this.register(this.actions, name, owner, handler as Handler, 0, true),
    };
  }

  /**
   * Resolves once every handler settled. Rejects with the first core handler failure (after
   * all handlers ran); the rejection is pre-observed so fire-and-forget publishers do not
   * raise unhandled rejections — the failure is logged as a core error either way.
   */
  emit<K extends ActionName>(
    name: K,
    payload: ActionHookMap[K],
  ): Promise<void> {
    const dispatched = this.dispatch(name, payload);
    dispatched.catch(() => {});
    return dispatched;
  }

  private async dispatch(name: ActionName, payload: unknown): Promise<void> {
    const registrations = [...(this.actions.get(name) ?? [])];
    const failures: unknown[] = [];
    await Promise.all(
      registrations.map(async (entry) => {
        const { owner, handler } = entry;
        if (entry.core) {
          if (!this.actions.get(name)?.includes(entry)) return;
          try {
            await handler(structuredClone(payload));
          } catch (error) {
            this.options.logger.error(
              `Core handler "${owner}" failed on "${name}": ${error instanceof Error ? error.message : String(error)}`,
            );
            failures.push(error);
          }
          return;
        }
        const result = await isolate(
          () =>
            this.actions.get(name)?.includes(entry)
              ? handler(structuredClone(payload))
              : undefined,
          this.options.timeoutMs,
        );
        if (!result.ok)
          this.options.logger.warn(
            `Plugin "${owner}" failed on "${name}": ${result.error.message}`,
          );
      }),
    );
    if (failures.length) throw failures[0];
  }

  async applyFilter<K extends FilterName>(
    name: K,
    value: FilterHookMap[K],
    accept: (value: unknown) => boolean,
    observe?: (
      owner: string,
      previous: FilterHookMap[K],
      next: FilterHookMap[K],
    ) => void,
  ): Promise<FilterHookMap[K]> {
    let current = value;
    for (const entry of [...(this.filters.get(name) ?? [])]) {
      const { owner, handler } = entry;
      if (!this.filters.get(name)?.includes(entry)) continue;
      const result = await isolate(
        () =>
          this.filters.get(name)?.includes(entry)
            ? handler(structuredClone(current))
            : current,
        this.options.timeoutMs,
      );
      if (!result.ok) {
        this.options.logger.warn(
          `Plugin "${owner}" failed on "${name}": ${result.error.message}`,
        );
        continue;
      }

      if (!this.filters.get(name)?.includes(entry)) continue;
      const accepted = snapshot(result.value, accept);

      if (accepted) {
        const next = accepted.value as FilterHookMap[K];
        observe?.(owner, structuredClone(current), structuredClone(next));
        current = next;
      } else
        this.options.logger.warn(
          `Plugin "${owner}" returned an invalid value for "${name}"; ignored`,
        );
    }
    return current;
  }

  private register(
    table: Map<string, Registration[]>,
    name: string,
    owner: string,
    handler: Handler,
    priority: number,
    core = false,
  ): Unsubscribe {
    const registration = {
      owner,
      handler,
      priority,
      sequence: this.sequence++,
      core,
    };
    const list = [...(table.get(name) ?? []), registration];
    table.set(
      name,
      list.sort((a, b) => a.priority - b.priority || a.sequence - b.sequence),
    );
    return () =>
      table.set(
        name,
        (table.get(name) ?? []).filter((entry) => entry !== registration),
      );
  }
}
