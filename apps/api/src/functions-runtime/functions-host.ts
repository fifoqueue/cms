import type { FunctionsDefinition } from '@cms/sdk/functions';
import type { PluginContext } from '@cms/sdk/plugin';
import type { PluginScope } from '#api/plugin-runtime/plugin-scope';
import { FunctionsScope } from '#api/functions-runtime/functions-scope';
import { serialQueue } from '#api/shared/serial-queue';
import type { Logger } from '#api/shared/logger';

export interface FunctionsSource {
  owner: string;
  hash: string;
  load(): Promise<FunctionsDefinition>;
  /** Called only after imports settle and this snapshot is no longer a recovery candidate. */
  release?(): Promise<void>;
}

export interface FunctionsStatus {
  owner: string;
  observedHash: string;
  loadedHash: string | null;
  lastError: string | null;
  updatedAt: string;
}

interface Activation {
  source: FunctionsSource;
  definition: FunctionsDefinition;
  scope: FunctionsScope;
}

export interface FunctionsHostDeps {
  sources(): Promise<FunctionsSource[]>;
  context(owner: string, scope: PluginScope): PluginContext;
  logger: Logger;
  invalidate(): void;
}

/** Sources arrive in precedence order: active theme, then site. */
export class FunctionsHost {
  private readonly exclusive = serialQueue();
  private active: Activation[] = [];
  private statuses: FunctionsStatus[] = [];

  constructor(private readonly deps: FunctionsHostDeps) {}

  status(): FunctionsStatus[] {
    return this.statuses.map((entry) => ({ ...entry }));
  }

  reconcile(): Promise<void> {
    return this.exclusive(async () => {
      let sources: FunctionsSource[];

      try {
        sources = await this.deps.sources();
      } catch (error) {
        this.deps.logger.error('Functions source reconciliation failed', error);

        return;
      }

      if (
        sources.length === this.statuses.length &&
        sources.every(
          (source, index) =>
            source.owner === this.statuses[index]?.owner &&
            source.hash === this.statuses[index]?.observedHash,
        )
      )
        return;

      const previous = new Map(
        this.active.map((entry) => [entry.source.owner, entry]),
      );

      this.active = [];
      this.statuses = [];

      for (const source of sources) {
        const status: FunctionsStatus = {
          owner: source.owner,
          observedHash: source.hash,
          loadedHash: null,
          lastError: null,
          updatedAt: new Date().toISOString(),
        };

        this.statuses.push(status);
        const unchanged = previous.get(source.owner);

        if (unchanged?.source.hash === source.hash) {
          this.active.push(unchanged);
          status.loadedHash = source.hash;
          continue;
        }

        try {
          const definition = await source.load();

          await this.activate(source, definition);
          status.loadedHash = source.hash;
        } catch (error) {
          // Exception details can contain credentials; only server logs receive them.
          this.deps.logger.error(`Functions "${source.owner}" failed`, error);
          status.lastError = 'activation_failed';
          const fallback = previous.get(source.owner);

          if (fallback) {
            this.active.push(fallback);
            status.loadedHash = fallback.source.hash;
          }
        }
      }

      for (const entry of [...this.active]) {
        try {
          entry.scope.commit();
          const replaced = previous.get(entry.source.owner);

          if (replaced && replaced !== entry) {
            replaced.scope.dispose();
          }
        } catch (error) {
          entry.scope.dispose();
          const index = this.active.indexOf(entry);
          const fallback = previous.get(entry.source.owner);

          this.active.splice(index, 1, ...(fallback ? [fallback] : []));
          const status = this.statuses.find(
            (status) => status.owner === entry.source.owner,
          )!;

          status.loadedHash = fallback?.source.hash ?? null;
          status.lastError = 'activation_failed';
          this.deps.logger.error('Functions registration failed', error);
        }
      }

      for (const entry of previous.values()) {
        if (!this.active.includes(entry)) entry.scope.dispose();
      }

      await this.release([
        ...sources,
        ...[...previous.values()].map((entry) => entry.source),
      ]);
      this.deps.invalidate();
    });
  }

  stop(): Promise<void> {
    return this.exclusive(async () => {
      const sources = this.active.map((entry) => entry.source);

      this.dispose();
      await this.release(sources);
      this.statuses = [];
      this.deps.invalidate();
    });
  }

  private async release(sources: FunctionsSource[]): Promise<void> {
    const retained = new Set(this.active.map((entry) => entry.source));

    for (const source of new Set(sources)) {
      if (retained.has(source)) continue;

      try {
        await source.release?.();
      } catch (error) {
        this.deps.logger.warn('Functions version cleanup failed', error);
      }
    }
  }

  private async activate(
    source: FunctionsSource,
    definition: FunctionsDefinition,
  ): Promise<void> {
    const scope = new FunctionsScope();

    try {
      await definition.api?.(this.deps.context(source.owner, scope));
      this.active.push({ source, definition, scope });
    } catch (error) {
      scope.dispose();
      throw error;
    }
  }

  private dispose(): void {
    for (const entry of this.active.splice(0).reverse()) {
      try {
        entry.scope.dispose();
      } catch (error) {
        this.deps.logger.error('Functions scope disposal failed', error);
      }
    }
  }
}
