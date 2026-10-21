// In-memory adapters for tests. They honour the same port contracts as the Prisma adapters.
import { stringifyJson } from '@cms/sdk';
import type { PluginDefinition } from '@cms/sdk/plugin';
import type {
  ContentCriteria,
  ContentRecord,
  ContentRepository,
} from '../../src/domain/content/content-repository';
import type { Clock, IdGenerator } from '../../src/domain/ports';
import type {
  CommittedBundle,
  PluginDataRepository,
  PluginDataScope,
  PluginModuleLoader,
  PluginPackageStore,
  PluginStateRecord,
  PluginStateRepository,
  StagedBundle,
} from '../../src/plugin-runtime/ports';
import { conflict } from '../../src/shared/errors';
import type { Logger } from '../../src/shared/logger';

export class MemoryContentRepository implements ContentRepository {
  readonly rows = new Map<string, ContentRecord>();

  async findById(id: string) {
    return structuredClone(this.rows.get(id) ?? null);
  }

  async findBySlug(slug: string) {
    return structuredClone(
      [...this.rows.values()].find((row) => row.slug === slug) ?? null,
    );
  }

  async list({ type, status, page, pageSize, orderBy }: ContentCriteria) {
    const matches = [...this.rows.values()]
      .filter(
        (row) =>
          (!type || row.type === type) && (!status || row.status === status),
      )
      .sort(
        (a, b) => (b[orderBy]?.getTime() ?? 0) - (a[orderBy]?.getTime() ?? 0),
      );
    return {
      items: structuredClone(
        matches.slice((page - 1) * pageSize, page * pageSize),
      ),
      total: matches.length,
    };
  }

  async insert(record: ContentRecord) {
    if (await this.findBySlug(record.slug))
      throw conflict('Slug is already in use');
    this.rows.set(record.id, structuredClone(record));
  }

  async update(record: ContentRecord) {
    const other = await this.findBySlug(record.slug);
    if (other && other.id !== record.id)
      throw conflict('Slug is already in use');
    this.rows.set(record.id, structuredClone(record));
  }

  async delete(id: string) {
    this.rows.delete(id);
  }
}

/** Stores JSON text like `PrismaPluginDataRepository`, so values round-trip identically. */
export class MemoryPluginData implements PluginDataRepository {
  readonly rows = new Map<string, string>();

  async get(pluginId: string, scope: PluginDataScope, key: string) {
    const json = this.rows.get(`${pluginId}/${scope}/${key}`);

    return json === undefined ? undefined : (JSON.parse(json) as unknown);
  }

  async set(
    pluginId: string,
    scope: PluginDataScope,
    key: string,
    value: unknown,
  ) {
    this.rows.set(`${pluginId}/${scope}/${key}`, stringifyJson(value));
  }

  async delete(pluginId: string, scope: PluginDataScope, key: string) {
    this.rows.delete(`${pluginId}/${scope}/${key}`);
  }

  async entries(pluginId: string, scope: PluginDataScope) {
    const prefix = `${pluginId}/${scope}/`;
    return Object.fromEntries(
      [...this.rows]
        .filter(([key]) => key.startsWith(prefix))
        .map(([key, json]) => [
          key.slice(prefix.length),
          JSON.parse(json) as unknown,
        ]),
    );
  }

  deleteAll(pluginId: string) {
    for (const key of this.rows.keys())
      if (key.startsWith(`${pluginId}/`)) this.rows.delete(key);
  }
}

export class MemoryPluginState implements PluginStateRepository {
  readonly rows = new Map<string, PluginStateRecord>();

  constructor(private readonly data: MemoryPluginData) {}

  async list() {
    return [...this.rows.values()].map((row) => ({ ...row }));
  }

  async save(record: PluginStateRecord) {
    this.rows.set(record.id, { ...record });
  }

  async setEnabled(id: string, enabled: boolean) {
    const row = this.rows.get(id);
    if (row) row.enabled = enabled;
  }

  async delete(id: string) {
    this.rows.delete(id);
    this.data.deleteAll(id);
  }
}

/**
 * Package store + loader pair where a bundle "source" is a key into `modules`.
 * Lets tests install plugin definitions without touching the file system.
 */
export class MemoryBundles implements PluginPackageStore, PluginModuleLoader {
  readonly modules = new Map<string, unknown>();
  /** Bundle sources by path: `staging:<n>` while staged, `<plugin-id>:<entry>` once committed. */
  readonly files = new Map<string, string>();
  private uploads = 0;

  register(source: string, definition: PluginDefinition | unknown) {
    this.modules.set(source, definition);
    return source;
  }

  async stage(source: string): Promise<StagedBundle> {
    const path = `staging:${++this.uploads}`;
    this.files.set(path, source);
    return { path, discard: async () => void this.files.delete(path) };
  }

  async commit(
    bundle: StagedBundle,
    pluginId: string,
  ): Promise<CommittedBundle> {
    const source = this.files.get(bundle.path);
    if (source === undefined) throw new Error(`No bundle at ${bundle.path}`);

    this.files.delete(bundle.path);
    const entry = `${source}@${bundle.path.slice('staging:'.length)}`;
    const path = this.locate(pluginId, entry);
    this.files.set(path, source);

    return {
      entry,
      prune: async () => {
        for (const other of this.files.keys())
          if (other.startsWith(`${pluginId}:`) && other !== path)
            this.files.delete(other);
      },
    };
  }

  locate(pluginId: string, entry: string) {
    return `${pluginId}:${entry}`;
  }

  async remove(pluginId: string) {
    for (const path of this.files.keys())
      if (path.startsWith(`${pluginId}:`)) this.files.delete(path);
  }

  async load(path: string) {
    const source = this.files.get(path);
    if (source === undefined) throw new Error(`No bundle at ${path}`);
    if (!this.modules.has(source)) throw new Error('Module evaluation failed');
    return this.modules.get(source);
  }
}

export const sequentialIds = (): IdGenerator => {
  let next = 0;
  return {
    next: () => `00000000-0000-7000-8000-${String(++next).padStart(12, '0')}`,
  };
};

export const fixedClock = (
  iso = '2026-01-01T00:00:00.000Z',
): Clock & { set(iso: string): void } => {
  let now = new Date(iso);
  return {
    now: () => new Date(now),
    set: (value) => void (now = new Date(value)),
  };
};

export const recordingLogger = () => {
  const lines: string[] = [];
  const logger: Logger = {
    info: (message) => void lines.push(`info ${message}`),
    warn: (message) => void lines.push(`warn ${message}`),
    error: (message) => void lines.push(`error ${message}`),
  };
  return { logger, lines };
};
