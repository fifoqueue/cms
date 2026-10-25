import { pluginUpdateManifestSchema } from '@cms/sdk';
import { serialQueue } from '#api/shared/serial-queue';
import type { HookDispatcher } from '#api/domain/ports';
import type {
  IssueParams,
  PluginInfo,
  PluginStatus,
  PluginUpdate,
} from '@cms/sdk';
import {
  DomainError,
  conflict,
  invalidInput,
  messageOf,
  issueParams,
  notFound,
  withParams,
  Errors,
} from '#api/shared/errors';
import { isolate } from '#api/shared/isolate';
import type { Logger } from '#api/shared/logger';
import type { PluginContextFactory } from '#api/plugin-runtime/plugin-context-factory';
import { validatePlugin } from '#api/plugin-runtime/plugin-definition';
import type { ValidPlugin } from '#api/plugin-runtime/plugin-definition';
import { PluginScope } from '#api/plugin-runtime/plugin-scope';
import type { PluginSettings } from '#api/plugin-runtime/plugin-settings';
import type {
  CommittedBundle,
  PluginModuleLoader,
  PluginPackageStore,
  PluginStateRepository,
  StagedBundle,
  UpdateFeed,
  VersionPolicy,
} from '#api/plugin-runtime/ports';

export interface PluginHostDeps {
  hooks?: HookDispatcher;
  state: PluginStateRepository;
  packages: PluginPackageStore;
  loader: PluginModuleLoader;
  contexts: PluginContextFactory;
  settings: PluginSettings;
  versions: VersionPolicy;
  updates: UpdateFeed;
  logger: Logger;
  timeoutMs: number;
}

interface InstalledPlugin {
  id: string;
  /** The bundle in use, as stored in the plugin state. */
  entry: string;
  enabled: boolean;
  /** `null` when the bundle could not be loaded. */
  plugin: ValidPlugin | null;
  /** Present exactly while the plugin is active. */
  scope: PluginScope | null;
  status: PluginStatus;
  /** Catalog text for administrators, with the values it leaves out. */
  error: { message: string; params?: IssueParams } | null;
}

/**
 * Plugin lifecycle at runtime: install, enable, disable, remove.
 * A plugin that fails at any step ends up `failed` or `inactive`; core keeps running either way.
 */
export class PluginHost {
  private readonly plugins = new Map<string, InstalledPlugin>();
  private readonly exclusive = serialQueue();

  constructor(private readonly deps: PluginHostDeps) {}

  /** Loads every installed plugin and activates the enabled ones. */
  boot(): Promise<void> {
    return this.exclusive(async () => {
      for (const record of await this.deps.state.list()) {
        const installed = this.initialize(record);
        this.plugins.set(record.id, installed);
        await this.loadInstalled(installed);
      }
      // Required plugins activate before the plugins that need them.
      const order: InstalledPlugin[] = [];
      const visit = (installed: InstalledPlugin, path: Set<string>) => {
        if (order.includes(installed) || path.has(installed.id)) return;
        path.add(installed.id);
        for (const id of Object.keys(
          installed.plugin?.manifest.requires.plugins ?? {},
        )) {
          const required = this.plugins.get(id);
          if (required?.enabled) visit(required, path);
        }
        order.push(installed);
      };
      for (const installed of this.plugins.values())
        if (installed.enabled) visit(installed, new Set());
      for (const installed of order) await this.activate(installed);
    });
  }

  /** Asks the plugin's update address for the latest version. Installs nothing. */
  async checkUpdate(id: string): Promise<PluginUpdate> {
    const manifest = this.require(id).plugin?.manifest;
    if (!manifest?.updateUrl) throw invalidInput(Errors.PluginNoUpdateUrl);
    const answer = pluginUpdateManifestSchema.safeParse(
      await this.deps.updates.read(manifest.updateUrl).catch(() => null),
    );
    if (!answer.success) throw invalidInput(Errors.PluginUpdateUnavailable);
    const { version, download } = answer.data;
    let newer: boolean;
    try {
      newer = this.deps.versions.compare(version, manifest.version) > 0;
    } catch {
      // Not semver: any other version counts as an update.
      newer = version !== manifest.version;
    }
    return {
      current: manifest.version,
      latest: version,
      newer,
      download: download ?? null,
    };
  }

  /**
   * Brings this process in line with the shared plugin state after another API instance
   * installed, upgraded, enabled, disabled or removed a plugin. Bundles must be on storage every
   * instance reads (`PLUGINS_DIR`). A bundle that fails to load stays failed until it changes.
   */
  reconcile(): Promise<void> {
    return this.exclusive(async () => {
      const records = new Map(
        (await this.deps.state.list()).map((record) => [record.id, record]),
      );
      for (const [id, installed] of this.plugins)
        if (!records.has(id)) {
          await this.deactivate(installed);
          this.plugins.delete(id);
          this.deps.logger.info(`Plugin "${id}" was removed elsewhere`);
        }
      for (const record of records.values()) {
        const current = this.plugins.get(record.id);
        if (current && current.entry === record.entry) {
          if (current.enabled === record.enabled) continue;
          current.enabled = record.enabled;
          if (record.enabled) await this.activate(current);
          else await this.deactivate(current);
          continue;
        }
        // Installed or upgraded elsewhere: load the new bundle, then swap.
        const installed = this.initialize(record);
        await this.loadInstalled(installed);
        if (current) await this.deactivate(current);
        this.plugins.set(record.id, installed);
        if (record.enabled) await this.activate(installed);
      }
    });
  }

  private initialize(
    record: Pick<InstalledPlugin, 'id' | 'entry' | 'enabled'>,
  ): InstalledPlugin {
    return {
      ...record,
      plugin: null,
      scope: null,
      status: 'inactive',
      error: null,
    };
  }

  private async loadInstalled(installed: InstalledPlugin) {
    try {
      installed.plugin = await this.load(
        this.deps.packages.locate(installed.id, installed.entry),
        installed.id,
      );
    } catch (error) {
      this.fail(installed, error);
    }
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
        if (error instanceof DomainError) throw error;
        this.deps.logger.error(`Invalid plugin bundle: ${messageOf(error)}`);
        throw invalidInput(Errors.PluginBundleInvalid);
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
        entry: committed.entry,
        enabled,
        plugin,
        scope: null,
        status: 'inactive',
        error: null,
      };
      this.plugins.set(id, installed);
      if (enabled) await this.activate(installed);
      this.notify(previous ? 'plugin.upgraded' : 'plugin.installed', installed);
      this.deps.logger.info(
        `Installed plugin "${id}" ${plugin.manifest.version}`,
      );
      return this.describe(installed);
    });
  }

  enable(id: string): Promise<PluginInfo> {
    return this.exclusive(async () => {
      const installed = this.require(id);
      if (!installed.plugin) throw conflict(Errors.PluginBundleUnloadable);
      await this.deps.state.setEnabled(id, true);
      installed.enabled = true;
      await this.activate(installed);
      if (installed.status === 'active')
        this.notify('plugin.activated', installed);
      return this.describe(installed);
    });
  }

  disable(id: string): Promise<PluginInfo> {
    return this.exclusive(async () => {
      const installed = this.require(id);
      await this.deps.state.setEnabled(id, false);
      installed.enabled = false;
      await this.deactivate(installed);
      this.notify('plugin.deactivated', installed);
      return this.describe(installed);
    });
  }

  /** Deactivates the plugin and deletes its bundle, settings and storage. */
  remove(id: string): Promise<void> {
    return this.exclusive(async () => {
      const installed = this.require(id);
      await this.deactivate(installed);
      await this.deps.state.delete(id);
      this.notify('plugin.removed', installed);
      await this.deps.packages.remove(id);
      this.plugins.delete(id);
      this.deps.logger.info(`Removed plugin "${id}"`);
    });
  }

  async updateSettings(id: string, values: unknown): Promise<PluginInfo> {
    const installed = this.require(id);
    if (!installed.plugin) throw conflict(Errors.PluginBundleUnloadable);
    await this.deps.settings.update(installed.plugin.manifest, values);
    return this.describe(installed);
  }

  private notify(
    event:
      | 'plugin.installed'
      | 'plugin.upgraded'
      | 'plugin.activated'
      | 'plugin.deactivated'
      | 'plugin.removed',
    installed: InstalledPlugin,
  ) {
    void this.deps.hooks?.emit(event, {
      id: installed.id,
      version: installed.plugin?.manifest.version ?? 'unknown',
      status: installed.status,
    });
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

  private async load(path: string, expectedId?: string): Promise<ValidPlugin> {
    // Importing runs the bundle's top-level code, so it is isolated like any other plugin call.
    const result = await isolate(
      () => this.deps.loader.load(path),
      this.deps.timeoutMs,
    );
    if (!result.ok) {
      this.deps.logger.error(
        `Could not import plugin bundle: ${result.error.message}`,
      );
      throw invalidInput(Errors.PluginBundleImport);
    }
    const validated = await isolate(() => {
      const plugin = validatePlugin(result.value);
      if (expectedId !== undefined && plugin.manifest.id !== expectedId)
        throw invalidInput(
          Errors.PluginIdInvalid,
          withParams(Errors.PluginIdInvalid, { id: plugin.manifest.id }),
        );
      return plugin;
    }, this.deps.timeoutMs);
    if (!validated.ok) {
      if (validated.error instanceof DomainError) throw validated.error;
      this.deps.logger.error(
        `Could not validate plugin bundle: ${validated.error.message}`,
      );
      throw invalidInput(Errors.PluginBundleImport);
    }
    return validated.value;
  }

  private async activate(installed: InstalledPlugin): Promise<void> {
    if (installed.scope || !installed.plugin) return;
    const { definition, manifest } = installed.plugin;
    const unmet = this.unmet(manifest);
    if (unmet) {
      // The reason is the CMS's own wording, so administrators see it as is.
      Object.assign(installed, { status: 'failed', error: unmet });
      this.deps.logger.warn(
        `Plugin "${installed.id}" not activated: ${unmet.message}`,
        unmet.params,
      );
      return;
    }
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
    Object.assign(installed, {
      status: 'failed',
      error: { message: Errors.PluginFailed },
    });
    // A refusal's values (such as the declared plugin id) travel in its issues.
    this.deps.logger.error(
      `Plugin "${installed.id}" failed: ${messageOf(error)}`,
      ...(error instanceof DomainError && error.issues ? [error.issues] : []),
    );
  }

  /** Why the plugin cannot run here, or `null` when its requirements are met. */
  private unmet({
    requires,
  }: ValidPlugin['manifest']): InstalledPlugin['error'] {
    const { versions } = this.deps;
    const fits = (version: string, range: string) => {
      try {
        return versions.satisfies(version, range);
      } catch {
        return false;
      }
    };
    if (requires.cms && !fits(versions.core, requires.cms))
      return {
        message: Errors.PluginRequiresCms,
        params: { range: requires.cms, version: versions.core },
      };
    for (const [id, range] of Object.entries(requires.plugins)) {
      const required = this.plugins.get(id);
      if (!required?.scope || !fits(required.plugin!.manifest.version, range))
        return {
          message: Errors.PluginRequiresPlugin,
          params: { id, range },
        };
    }
    return null;
  }

  private require(id: string): InstalledPlugin {
    const installed = this.plugins.get(id);
    if (!installed) throw notFound(Errors.PluginNotFound);
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
      error: installed.error?.message ?? null,
      // Manifest ranges and ids are the plugin's own text: bounded like every other params.
      ...(installed.error?.params && {
        errorParams: issueParams(installed.error.params),
      }),
      updatable: !!manifest?.updateUrl,
      settings: manifest?.settings ?? [],
      values: manifest ? await this.deps.settings.values(manifest) : {},
    };
  }
}
