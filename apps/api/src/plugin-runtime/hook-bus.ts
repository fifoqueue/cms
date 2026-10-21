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
import type { HookDispatcher } from '../domain/ports';
import { isolate } from '../shared/isolate';
import type { Logger } from '../shared/logger';

type Handler = (value: unknown) => Awaitable<unknown>;

interface Registration {
  owner: string;
  handler: Handler;
  priority: number;
  sequence: number;
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
 * Hook registry and dispatcher. Every handler gets a copy of the value, runs isolated,
 * and is skipped (with a warning) when it throws, times out or returns an invalid value.
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

  async emit<K extends ActionName>(
    name: K,
    payload: ActionHookMap[K],
  ): Promise<void> {
    const registrations = [...(this.actions.get(name) ?? [])];
    await Promise.all(
      registrations.map(async ({ owner, handler }) => {
        const result = await isolate(
          () => handler(structuredClone(payload)),
          this.options.timeoutMs,
        );
        if (!result.ok)
          this.options.logger.warn(
            `Plugin "${owner}" failed on "${name}": ${result.error.message}`,
          );
      }),
    );
  }

  async applyFilter<K extends FilterName>(
    name: K,
    value: FilterHookMap[K],
    accept: (value: unknown) => boolean,
  ): Promise<FilterHookMap[K]> {
    let current = value;
    for (const { owner, handler } of [...(this.filters.get(name) ?? [])]) {
      const result = await isolate(
        () => handler(structuredClone(current)),
        this.options.timeoutMs,
      );
      if (!result.ok) {
        this.options.logger.warn(
          `Plugin "${owner}" failed on "${name}": ${result.error.message}`,
        );
        continue;
      }

      const accepted = snapshot(result.value, accept);

      if (accepted) current = accepted.value as FilterHookMap[K];
      else
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
  ): Unsubscribe {
    const registration = {
      owner,
      handler,
      priority,
      sequence: this.sequence++,
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
