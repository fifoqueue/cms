export interface PluginStateRecord {
  id: string;
  /** File name of the current bundle, as `CommittedBundle.entry`. */
  entry: string;
  enabled: boolean;
}

export interface PluginStateRepository {
  list(): Promise<PluginStateRecord[]>;
  /** Inserts or replaces. */
  save(record: PluginStateRecord): Promise<void>;
  setEnabled(id: string, enabled: boolean): Promise<void>;
  /** Also deletes everything in `PluginDataRepository` owned by the plugin. */
  delete(id: string): Promise<void>;
}

export type PluginDataScope = 'settings' | 'kv';

/** Plugin-owned JSON values, namespaced by plugin id and scope. */
export interface PluginDataRepository {
  get(pluginId: string, scope: PluginDataScope, key: string): Promise<unknown>;
  set(
    pluginId: string,
    scope: PluginDataScope,
    key: string,
    value: unknown,
  ): Promise<void>;
  delete(pluginId: string, scope: PluginDataScope, key: string): Promise<void>;
  entries(
    pluginId: string,
    scope: PluginDataScope,
  ): Promise<Record<string, unknown>>;
}

export interface StagedBundle {
  /** Importable path of the uploaded bundle. */
  path: string;
  discard(): Promise<void>;
}

/**
 * A bundle stored beside the plugin's previous bundles, which stay loadable until `prune`.
 * A failed state save does not prove `entry` unpersisted, so without `prune` every bundle is kept.
 */
export interface CommittedBundle {
  /** Unique entry name, to persist as `PluginStateRecord.entry`. */
  entry: string;
  /** Deletes the plugin's other bundles. Only once saving `entry` succeeded. */
  prune(): Promise<void>;
}

/** Where plugin bundles live. Knows files, not plugins. */
export interface PluginPackageStore {
  stage(source: string): Promise<StagedBundle>;
  /** Moves the staged bundle into the plugin's bundles under a new entry, leaving the others untouched. */
  commit(bundle: StagedBundle, pluginId: string): Promise<CommittedBundle>;
  locate(pluginId: string, entry: string): string;
  remove(pluginId: string): Promise<void>;
}

/** Semantic version checks; the runtime knows no versioning scheme itself. */
export interface VersionPolicy {
  /** The running CMS version. */
  core: string;
  satisfies(version: string, range: string): boolean;
  /** Negative, zero or positive, like a sort comparator. */
  compare(a: string, b: string): number;
}

/** Reads a small JSON document from an https address. */
export interface UpdateFeed {
  read(url: string): Promise<unknown>;
}

/** Runs recurring work in one instance at a time (the core scheduler). */
export interface TaskScheduler {
  add(task: {
    name: string;
    intervalMs: number;
    run(): Promise<void>;
  }): () => void;
}

export interface PluginModuleLoader {
  /** Imports a bundle and returns its `plugin` export, unvalidated. */
  load(path: string): Promise<unknown>;
}
