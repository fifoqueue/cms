import type { PublicCache } from '#api/domain/site/public-cache';
import { AsyncLocalStorage } from 'node:async_hooks';
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
  CustomHookDefinition,
} from '@cms/sdk/plugin';
import { Errors } from '#api/shared/errors';
import type { HookDispatcher } from '#api/domain/ports';
import { isolate } from '#api/shared/isolate';
import type { Logger } from '#api/shared/logger';

type Handler = (
  value: unknown,
  ...args: readonly unknown[]
) => Awaitable<unknown>;

const sourceOrder = (owner: string) =>
  owner === 'functions:site' ? 2 : owner.startsWith('theme:') ? 1 : 0;

const coreNames = new Set(
  `user.signedIn user.signInFailed user.secondFactorChanged content.created content.updated content.published content.deleted content.trashed content.restored media.uploaded media.deleted site.updated comment.created comment.statusChanged content.public content.publicSummary comment.beforeSave user.signInAllowed user.secondFactorRequired
pattern.created pattern.updated pattern.deleted theme.activated theme.installed theme.deleted template.updated templatePart.updated styles.updated menu.created menu.updated menu.deleted widgets.updated settings.updated pattern.beforeSave menu.beforeSave menu.items widgets.beforeSave
discussion.updated comment.updated comment.deleted discussion.beforeSave comment.query comment.public comment.notification comment.push comment.submitAllowed
content.revisionSaved content.autosaved content.termsChanged contentType.created contentType.updated contentType.deleted field.created field.updated field.deleted permalinks.updated term.created term.updated term.deleted content.scheduled content.revisionRestored content.beforeSave content.publishAllowed content.deleteAllowed content.permalink contentType.beforeSave field.beforeSave term.beforeSave term.query term.public content.query
media.updated media.beforeSave media.filename media.uploadAllowed export.data import.item dashboard.data webhook.payload email.beforeSend email.sendAllowed import.completed export.generated site.installed egress.updated webhook.created webhook.updated webhook.deleted webhook.delivered webhook.failed plugin.installed plugin.upgraded plugin.activated plugin.deactivated plugin.removed email.sent email.failed email.settingsUpdated job.failed
search.query search.results search.document search.indexed sitemap.entries feed.items feed.channel robots.txt llms.txt seo.markdown seo.meta seo.updated seo.beforeSave seo.public
user.created user.updated user.roleChanged user.deleted role.created role.updated role.deleted security.updated privacy.requested privacy.exported privacy.erased protection.blocked user.beforeSave user.query user.capabilities privacy.exportData user.public user.registrationAllowed`.split(
    /\s+/,
  ),
);

interface Registration {
  owner: string;
  generation: object;
  handler: Handler;
  priority: number;
  sequence: number;
  /** Core handlers run directly: no isolation or timeout, and their errors propagate. */
  core: boolean;
  trusted: boolean;
}

interface Definition {
  owner: string;
  generation: object;
  contract: CustomHookDefinition;
  trusted: boolean;
  active: boolean;
  previous?: Definition;
}

interface DispatchFrame {
  name: string;
  active: boolean;
  parent?: DispatchFrame;
}

const isolatedCopy = <T>(value: T): T => {
  const copy = structuredClone(value);
  const seen = new Set<object>();
  const visit = (item: unknown): void => {
    if (!item || typeof item !== 'object' || seen.has(item)) return;
    seen.add(item);
    if (item instanceof SharedArrayBuffer)
      throw new Error(Errors.HookValueInvalid);
    if (ArrayBuffer.isView(item)) {
      visit(item.buffer);
      return;
    }
    if (item instanceof Map)
      for (const [key, entry] of item) {
        visit(key);
        visit(entry);
      }
    if (item instanceof Set) for (const entry of item) visit(entry);
    for (const key of Reflect.ownKeys(item)) {
      const descriptor = Object.getOwnPropertyDescriptor(item, key);
      if (descriptor && 'value' in descriptor) visit(descriptor.value);
    }
  };
  visit(copy);
  return copy;
};

const activeParent = (frame?: DispatchFrame): DispatchFrame | undefined => {
  while (frame && !frame.active) frame = frame.parent;
  if (frame) frame.parent = activeParent(frame.parent);
  return frame;
};

/**
 * A core-owned copy of an accepted filter result, so the plugin cannot change it after
 * validation through a reference it kept. A throwing validator or copy counts as invalid.
 */
const snapshot = async (
  value: unknown,
  accept: (value: unknown) => Awaitable<boolean>,
): Promise<{ value: unknown } | undefined> => {
  try {
    const candidate = isolatedCopy(value);
    return (await accept(candidate)) ? { value: candidate } : undefined;
  } catch {
    return undefined;
  }
};

export interface HookBusOptions {
  publicCache?: Pick<PublicCache, 'invalidate'>;
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
  private readonly counts = new Map<string, number>();
  private readonly definitions = new Map<string, Definition>();
  private readonly dispatchContext = new AsyncLocalStorage<DispatchFrame>();

  private async within<T>(name: string, run: () => Promise<T>): Promise<T> {
    const frame: DispatchFrame = {
      name,
      active: true,
      parent: activeParent(this.dispatchContext.getStore()),
    };
    try {
      return await this.dispatchContext.run(frame, run);
    } finally {
      frame.active = false;
    }
  }

  constructor(private readonly options: HookBusOptions) {}

  has(name: string): boolean {
    return !!(this.actions.get(name)?.length || this.filters.get(name)?.length);
  }

  private count(name: string): void {
    if (
      coreNames.has(name) ||
      this.definitions.has(name) ||
      this.actions.has(name) ||
      this.filters.has(name)
    )
      this.counts.set(name, (this.counts.get(name) ?? 0) + 1);
  }

  private update(
    table: Map<string, Registration[]>,
    name: string,
    entries: Registration[],
  ): void {
    if (entries.length) table.set(name, entries);
    else table.delete(name);
    if (
      !coreNames.has(name) &&
      !this.definitions.has(name) &&
      !this.actions.has(name) &&
      !this.filters.has(name)
    )
      this.counts.delete(name);
  }

  registrar(owner: string, options: { trusted?: boolean } = {}): HookRegistrar {
    const generation = {};
    return {
      define: (name, contract) =>
        this.define(owner, name, contract, options.trusted, generation),
      do: (name, payload) => this.do(name, payload),
      apply: (name, value, ...args) => this.apply(name, value, ...args),
      current: () => {
        const frame = this.dispatchContext.getStore();
        return frame?.active ? frame.name : undefined;
      },
      doing: (name) => {
        let frame = this.dispatchContext.getStore();
        while (frame) {
          if (frame.active && (name === undefined || frame.name === name))
            return true;
          frame = frame.parent;
        }
        return false;
      },
      remove: (name, handler) => {
        for (const table of [this.actions, this.filters])
          this.update(
            table,
            name,
            (table.get(name) ?? []).filter(
              (entry) => entry.handler !== handler,
            ),
          );
      },
      removeAll: (name, priority) => {
        for (const table of [this.actions, this.filters])
          if (priority === undefined) this.update(table, name, []);
          else
            this.update(
              table,
              name,
              (table.get(name) ?? []).filter(
                (entry) => entry.priority !== priority,
              ),
            );
      },
      has: (name, handler) =>
        [this.actions, this.filters].some((table) =>
          (table.get(name) ?? []).some(
            (entry) => handler === undefined || entry.handler === handler,
          ),
        ),
      did: (name) => this.counts.get(name) ?? 0,
      on: <K extends string>(
        name: K,
        handler: ActionHandler<K>,
        priority = 10,
      ) =>
        this.register(
          this.actions,
          name,
          owner,
          handler as Handler,
          priority,
          false,
          options.trusted,
          generation,
        ),
      filter: <K extends string>(
        name: K,
        handler: FilterHandler<K>,
        priority = 10,
      ) =>
        this.register(
          this.filters,
          name,
          owner,
          handler as Handler,
          priority,
          false,
          options.trusted,
          generation,
        ),
    };
  }

  /**
   * Core action subscriptions; for the composition root only, never handed to plugins.
   * Handlers are awaited by `emit` without isolation or timeout.
   */
  core(owner: string): Pick<HookRegistrar, 'on'> {
    return {
      on: <K extends string>(
        name: K,
        handler: ActionHandler<K>,
        priority = 0,
      ) =>
        this.register(
          this.actions,
          name,
          owner,
          handler as Handler,
          priority,
          true,
        ),
    };
  }

  define(
    owner: string,
    name: string,
    contract: CustomHookDefinition,
    trusted = false,
    generation: object = {},
  ): Unsubscribe {
    const previous = this.definitions.get(name);
    if (
      !name ||
      coreNames.has(name) ||
      (previous &&
        (previous.owner !== owner || previous.generation === generation)) ||
      !['action', 'filter'].includes(contract.kind) ||
      typeof contract.validate !== 'function'
    )
      throw new Error(Errors.HookDefinitionInvalid);
    const entry: Definition = {
      owner,
      generation,
      contract: { ...contract },
      trusted,
      active: true,
      previous,
    };
    this.definitions.set(name, entry);
    return () => {
      if (!entry.active) return;
      entry.active = false;
      let current = this.definitions.get(name);
      while (current && !current.active) current = current.previous;
      if (current) {
        this.definitions.set(name, current);
        let ancestor = current;
        while (ancestor.previous) {
          if (!ancestor.previous.active)
            ancestor.previous = ancestor.previous.previous;
          else ancestor = ancestor.previous;
        }
      } else {
        this.definitions.delete(name);
        this.counts.delete(name);
      }
      for (const table of [this.actions, this.filters])
        this.update(
          table,
          name,
          (table.get(name) ?? []).filter(
            (registration) => registration.generation !== generation,
          ),
        );
    };
  }

  async do(name: string, payload: unknown): Promise<void> {
    const entry = this.definitions.get(name);
    if (
      !entry ||
      entry.contract.kind !== 'action' ||
      !this.actions.get(name)?.length
    ) {
      this.count(name);
      return;
    }
    const accepted = await snapshot(payload, (candidate) =>
      this.valid(entry.contract, candidate, entry.trusted),
    );
    if (!accepted) return;
    if (this.definitions.get(name) !== entry) return;
    await this.emit(name as ActionName, accepted.value as never);
  }

  async apply(
    name: string,
    value: unknown,
    ...args: readonly unknown[]
  ): Promise<unknown> {
    const entry = this.definitions.get(name);
    if (
      !entry ||
      entry.contract.kind !== 'filter' ||
      !this.filters.get(name)?.length
    ) {
      this.count(name);
      return value;
    }
    const accepted = await snapshot(value, (candidate) =>
      this.valid(entry.contract, candidate, entry.trusted),
    );
    if (!accepted) return value;
    if (this.definitions.get(name) !== entry) return value;
    return this.applyFilter(
      name as FilterName,
      accepted.value as never,
      (next) => this.valid(entry.contract, next, entry.trusted),
      undefined,
      args,
    );
  }

  private async valid(
    contract: CustomHookDefinition,
    value: unknown,
    trusted: boolean,
  ): Promise<boolean> {
    try {
      if (trusted) {
        if (contract.validate(value) === true) return true;
      } else {
        const result = await isolate(
          () => contract.validate(isolatedCopy(value)),
          this.options.timeoutMs,
        );
        if (result.ok && result.value === true) return true;
      }
    } catch {
      // A validator is extension code too.
    }
    this.options.logger.warn(Errors.HookValueInvalid);
    return false;
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
    this.count(name);
    this.options.publicCache?.invalidate();
    if (!this.actions.get(name)?.length) return Promise.resolve();
    const dispatched = this.within(name, () =>
      this.dispatch(name, payload),
    ).finally(() => this.options.publicCache?.invalidate());
    dispatched.catch(() => {});
    return dispatched;
  }

  private async dispatch(name: ActionName, payload: unknown): Promise<void> {
    const registrations = [...(this.actions.get(name) ?? [])];
    const failures: unknown[] = [];
    for (const entry of registrations) {
      const { owner, handler } = entry;
      if (entry.trusted) {
        if (!this.actions.get(name)?.includes(entry)) continue;
        try {
          await handler(payload);
        } catch (error) {
          this.options.logger.warn(
            `Functions "${owner}" failed on "${name}": ${error instanceof Error ? error.message : String(error)}`,
          );
        }
        continue;
      }
      if (entry.core) {
        if (!this.actions.get(name)?.includes(entry)) continue;
        try {
          await handler(payload);
        } catch (error) {
          this.options.logger.error(
            `Core handler "${owner}" failed on "${name}": ${error instanceof Error ? error.message : String(error)}`,
          );
          failures.push(error);
        }
        continue;
      }
      const result = await isolate(
        () =>
          this.actions.get(name)?.includes(entry)
            ? handler(isolatedCopy(payload))
            : undefined,
        this.options.timeoutMs,
      );
      if (!result.ok)
        this.options.logger.warn(
          `Plugin "${owner}" failed on "${name}": ${result.error.message}`,
        );
    }
    if (failures.length) throw failures[0];
  }

  async applyFilter<K extends FilterName>(
    name: K,
    value: FilterHookMap[K],
    accept: (value: unknown) => Awaitable<boolean>,
    observe?: (
      owner: string,
      previous: FilterHookMap[K],
      next: FilterHookMap[K],
    ) => void,
    args: readonly unknown[] = [],
  ): Promise<FilterHookMap[K]> {
    this.count(name);
    if (!this.filters.get(name)?.length) return value;
    return this.within(name, () =>
      this.filterValue(name, value, accept, observe, args),
    );
  }

  private async filterValue<K extends FilterName>(
    name: K,
    value: FilterHookMap[K],
    accept: (value: unknown) => Awaitable<boolean>,
    observe:
      | ((
          owner: string,
          previous: FilterHookMap[K],
          next: FilterHookMap[K],
        ) => void)
      | undefined,
    args: readonly unknown[],
  ): Promise<FilterHookMap[K]> {
    let current = value;
    for (const entry of [...(this.filters.get(name) ?? [])]) {
      const { owner, handler } = entry;
      if (!this.filters.get(name)?.includes(entry)) continue;
      if (entry.trusted) {
        try {
          const next = await handler(current, ...args);
          if (!this.filters.get(name)?.includes(entry)) continue;
          if (await accept(next)) {
            if (!this.filters.get(name)?.includes(entry)) continue;
            observe?.(owner, current, next as FilterHookMap[K]);
            current = next as FilterHookMap[K];
          } else {
            this.options.logger.warn(
              `Functions "${owner}" returned an invalid value for "${name}"; ignored`,
            );
          }
        } catch (error) {
          this.options.logger.warn(
            `Functions "${owner}" failed on "${name}": ${error instanceof Error ? error.message : String(error)}`,
          );
        }
        continue;
      }
      const result = await isolate(
        () =>
          this.filters.get(name)?.includes(entry)
            ? handler(isolatedCopy(current), ...isolatedCopy(args))
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
      const accepted = await snapshot(result.value, accept);
      if (!this.filters.get(name)?.includes(entry)) continue;

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
    trusted = false,
    generation: object = {},
  ): Unsubscribe {
    const registration = {
      owner,
      generation,
      handler,
      priority,
      sequence: this.sequence++,
      core,
      trusted,
    };
    const list = [...(table.get(name) ?? []), registration];
    table.set(
      name,
      list.sort(
        (a, b) =>
          a.priority - b.priority ||
          sourceOrder(a.owner) - sourceOrder(b.owner) ||
          a.sequence - b.sequence,
      ),
    );
    return () =>
      this.update(
        table,
        name,
        (table.get(name) ?? []).filter((entry) => entry !== registration),
      );
  }
}
