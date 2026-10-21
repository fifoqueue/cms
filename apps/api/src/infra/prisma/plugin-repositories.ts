import { stringifyJson } from '@cms/sdk';
import type {
  PluginDataRepository,
  PluginDataScope,
  PluginStateRecord,
  PluginStateRepository,
} from '../../plugin-runtime/ports';
import type { Database } from './client';

export class PrismaPluginStateRepository implements PluginStateRepository {
  constructor(private readonly db: Database) {}

  list() {
    return this.db.plugin.findMany({
      select: { id: true, entry: true, enabled: true },
      orderBy: { id: 'asc' },
    });
  }

  async save({ id, entry, enabled }: PluginStateRecord) {
    await this.db.plugin.upsert({
      where: { id },
      create: { id, entry, enabled },
      update: { entry, enabled },
    });
  }

  async setEnabled(id: string, enabled: boolean) {
    await this.db.plugin.update({ where: { id }, data: { enabled } });
  }

  async delete(id: string) {
    // plugin_data rows cascade.
    await this.db.plugin.deleteMany({ where: { id } });
  }
}

export class PrismaPluginDataRepository implements PluginDataRepository {
  constructor(private readonly db: Database) {}

  async get(pluginId: string, scope: PluginDataScope, key: string) {
    const row = await this.db.pluginData.findUnique({
      where: { pluginId_scope_key: { pluginId, scope, key } },
    });
    return row ? (JSON.parse(row.value) as unknown) : undefined;
  }

  async set(
    pluginId: string,
    scope: PluginDataScope,
    key: string,
    value: unknown,
  ) {
    const json = stringifyJson(value);
    await this.db.pluginData.upsert({
      where: { pluginId_scope_key: { pluginId, scope, key } },
      create: { pluginId, scope, key, value: json },
      update: { value: json },
    });
  }

  async delete(pluginId: string, scope: PluginDataScope, key: string) {
    await this.db.pluginData.deleteMany({ where: { pluginId, scope, key } });
  }

  async entries(pluginId: string, scope: PluginDataScope) {
    const rows = await this.db.pluginData.findMany({
      where: { pluginId, scope },
    });
    return Object.fromEntries(
      rows.map(({ key, value }) => [key, JSON.parse(value) as unknown]),
    );
  }
}
