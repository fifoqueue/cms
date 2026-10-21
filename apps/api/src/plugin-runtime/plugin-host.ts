import type { PluginInfo, PluginStatus } from '@cms/sdk';
import {
  DomainError,
  conflict,
  invalidInput,
  messageOf,
  notFound,
} from '../shared/errors';
import { isolate } from '../shared/isolate';
import type { Logger } from '../shared/logger';
import type { PluginContextFactory } from './plugin-context-factory';
import { validatePlugin } from './plugin-definition';
import type { ValidPlugin } from './plugin-definition';
import { PluginScope } from './plugin-scope';
import type { PluginSettings } from './plugin-settings';
import type {
  CommittedBundle,
  PluginModuleLoader,
  PluginPackageStore,
  PluginStateRepository,
  StagedBundle,
} from './ports';

export interface PluginHostDeps {
  state: PluginStateRepository;
  packages: PluginPackageStore;
  loader: PluginModuleLoader;
  contexts: PluginContextFactory;
  settings: PluginSettings;
  logger: Logger;
  timeoutMs: number;
}

interface InstalledPlugin {
  id: string;
  enabled: boolean;
  /** `null` when the bundle could not be loaded. */
  plugin: ValidPlugin | null;
  /** Present exactly while the plugin is active. */
  scope: PluginScope | null;
  status: PluginStatus;
  error: string | null;
}

/**
 * Plugin lifecycle at runtime: install, enable, disable, remove.
 * A plugin that fails at any step ends up `failed` or `inactive`; core keeps running either way.
 */
export class PluginHost {
  private readonly plugins = new Map<string, InstalledPlugin>();
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly deps: PluginHostDeps) {}

  /** Loads every installed plugin and activates the enabled ones. */
  boot(): Promise<void> {
    return this.exclusive(async () => {
      for (const record of await this.deps.state.list()) {
        const installed: InstalledPlugin = {
          ...record,
          plugin: null,
          scope: null,
          status: 'inactive',
          error: null,
        };
        this.plugins.set(record.id, installed);
        try {
          installed.plugin = await this.load(
            this.deps.packages.locate(record.id, record.entry),
          );
        } catch (error) {
          this.fail(installed, error);
          continue;
        }
        if (record.enabled) await this.activate(installed);
      }
    });
  }

  /** Deactivates everything, e.g. on shutdown. State is kept. */
  stop(): Promise<void> {
    return this.exclusive(async () => {
      for (const installed of this.plugins.values())
        await this.deactivate(installed);
    });
  }

  list(): Promise<PluginInfo[]> {
    const plugins = [...this.plugins.values()].sort((a, b) =>
      a.id.localeCompare(b.id),
    );
    return Promise.all(plugins.map((installed) => this.describe(installed)));
  }

  /** Installs a bundle, or upgrades the plugin with the same id while keeping its enabled state and data. */
  install(source: string): Promise<PluginInfo> {
    return this.exclusive(async () => {
      const staged = await this.deps.packages.stage(source);
      let plugin: ValidPlugin;
      try {
        plugin = await this.load(staged.path);
      } catch (error) {
        await staged.discard();
        throw error instanceof DomainError
          ? error
          : invalidInput(`Invalid plugin bundle: ${messageOf(error)}`);
      }

      const { id } = plugin.manifest;
      const previous = this.plugins.get(id);
      const enabled = previous?.enabled ?? false;

      // The previous version keeps running from its bundle until the new entry is persisted.
      const committed = await this.persist(staged, id, enabled);

      if (previous) await this.deactivate(previous);
      await this.cleanup(
        () => committed.prune(),
        `Could not delete superseded bundles of plugin "${id}"`,
      );

      const installed: InstalledPlugin = {
        id,
        enabled,
        plugin,
        scope: null,
        status: 'inactive',
        error: null,
      };
      this.plugins.set(id, installed);
      if (enabled) await this.activate(installed);
      this.deps.logger.info(
        `Installed plugin "${id}" ${plugin.manifest.version}`,
      );
      return this.describe(installed);
    });
  }

  enable(id: string): Promise<PluginInfo> {
    return this.exclusive(async () => {
      const installed = this.require(id);
      if (!installed.plugin)
        throw conflict('Plugin bundle could not be loaded; install it again');
      await this.deps.state.setEnabled(id, true);
      installed.enabled = true;
      await this.activate(installed);
      return this.describe(installed);
    });
  }

  disable(id: string): Promise<PluginInfo> {
    return this.exclusive(async () => {
      const installed = this.require(id);
      await this.deps.state.setEnabled(id, false);
      installed.enabled = false;
      await this.deactivate(installed);
      return this.describe(installed);
    });
  }

  /** Deactivates the plugin and deletes its bundle, settings and storage. */
  remove(id: string): Promise<void> {
    return this.exclusive(async () => {
      const installed = this.require(id);
      await this.deactivate(installed);
      await this.deps.state.delete(id);
      await this.deps.packages.remove(id);
      this.plugins.delete(id);
      this.deps.logger.info(`Removed plugin "${id}"`);
    });
  }

  async updateSettings(id: string, values: unknown): Promise<PluginInfo> {
    const installed = this.require(id);
    if (!installed.plugin)
      throw conflict('Plugin bundle could not be loaded; install it again');
    await this.deps.settings.update(installed.plugin.manifest, values);
    return this.describe(installed);
  }

  /**
   * Commits the staged bundle and saves its entry. A failed save may still have been persisted,
   * so both bundles are kept and whichever the state references stays loadable; the next successful
   * upgrade prunes the other.
   */
  private async persist(
    staged: StagedBundle,
    id: string,
    enabled: boolean,
  ): Promise<CommittedBundle> {
    let committed: CommittedBundle;
    try {
      committed = await this.deps.packages.commit(staged, id);
    } catch (error) {
      await this.cleanup(
        () => staged.discard(),
        `Could not delete rejected bundle of plugin "${id}"`,
      );
      throw error;
    }

    await this.deps.state.save({ id, entry: committed.entry, enabled });

    return committed;
  }

  /** Bundle cleanup whose failure only leaves unused files behind, so it must not change the outcome. */
  private async cleanup(
    step: () => Promise<void>,
    what: string,
  ): Promise<void> {
    try {
      await step();
    } catch (error) {
      this.deps.logger.warn(`${what}: ${messageOf(error)}`);
    }
  }

  private async load(path: string): Promise<ValidPlugin> {
    // Importing runs the bundle's top-level code, so it is isolated like any other plugin call.
    const result = await isolate(
      () => this.deps.loader.load(path),
      this.deps.timeoutMs,
    );
    if (!result.ok)
      throw invalidInput(
        `Could not import plugin bundle: ${result.error.message}`,
      );
    return validatePlugin(result.value);
  }

  private async activate(installed: InstalledPlugin): Promise<void> {
    if (installed.scope || !installed.plugin) return;
    const { definition, manifest } = installed.plugin;
    const scope = new PluginScope();
    const context = this.deps.contexts.create(manifest, scope);
    const result = await isolate(
      () => definition.activate(context),
      this.deps.timeoutMs,
    );
    if (!result.ok) {
      scope.dispose();
      this.fail(installed, result.error);
      return;
    }
    Object.assign(installed, { scope, status: 'active', error: null });
    this.deps.logger.info(`Activated plugin "${installed.id}"`);
  }

  private async deactivate(installed: InstalledPlugin): Promise<void> {
    const { scope, plugin } = installed;
    if (!scope) {
      if (plugin) Object.assign(installed, { status: 'inactive', error: null });
      return;
    }
    // Release registrations first, so nothing of the plugin runs while it shuts down.
    installed.scope = null;
    scope.dispose();
    Object.assign(installed, { status: 'inactive', error: null });
    if (plugin?.definition.deactivate) {
      const deactivate = plugin.definition.deactivate.bind(plugin.definition);
      const result = await isolate(deactivate, this.deps.timeoutMs);
      if (!result.ok)
        this.deps.logger.warn(
          `Plugin "${installed.id}" failed to deactivate: ${result.error.message}`,
        );
    }
  }

  private fail(installed: InstalledPlugin, error: unknown): void {
    Object.assign(installed, { status: 'failed', error: messageOf(error) });
    this.deps.logger.error(
      `Plugin "${installed.id}" failed: ${messageOf(error)}`,
    );
  }

  private require(id: string): InstalledPlugin {
    const installed = this.plugins.get(id);
    if (!installed) throw notFound('Plugin');
    return installed;
  }

  private async describe(installed: InstalledPlugin): Promise<PluginInfo> {
    const manifest = installed.plugin?.manifest;
    return {
      id: installed.id,
      name: manifest?.name ?? installed.id,
      version: manifest?.version ?? 'unknown',
      description: manifest?.description ?? '',
      enabled: installed.enabled,
      status: installed.status,
      error: installed.error,
      settings: manifest?.settings ?? [],
      values: manifest ? await this.deps.settings.values(manifest) : {},
    };
  }

  /** Lifecycle changes run one at a time, so concurrent admin requests cannot interleave. */
  private exclusive<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task);
    this.queue = run.catch(() => undefined);
    return run;
  }
}
