import { mkdir, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { KEBAB_CASE } from '@cms/sdk';
import { randomUUIDv7 } from 'bun';
import type {
  CommittedBundle,
  PluginPackageStore,
  StagedBundle,
} from '#api/plugin-runtime/ports';
import { Errors } from '#api/shared/errors';

const ENTRY = /^[\w-]+\.js$/;

/** `<root>/<plugin-id>/<unique>.js`. A unique file name per upload means a fresh module on every import. */
export class FsPluginPackageStore implements PluginPackageStore {
  private readonly root: string;

  constructor(directory: string) {
    this.root = resolve(directory);
  }

  async stage(source: string): Promise<StagedBundle> {
    const directory = join(this.root, '.staging');
    await mkdir(directory, { recursive: true });
    const path = join(directory, `${randomUUIDv7()}.js`);
    await writeFile(path, source, 'utf8');
    return { path, discard: () => rm(path, { force: true }) };
  }

  async commit(
    bundle: StagedBundle,
    pluginId: string,
  ): Promise<CommittedBundle> {
    const directory = this.directory(pluginId);
    await mkdir(directory, { recursive: true });

    const entry = basename(bundle.path);
    await rename(bundle.path, join(directory, entry));

    return {
      entry,
      prune: async () => {
        for (const file of await readdir(directory)) {
          if (file !== entry)
            await rm(join(directory, file), { recursive: true, force: true });
        }
      },
    };
  }

  locate(pluginId: string, entry: string): string {
    if (!ENTRY.test(entry))
      throw new Error(Errors.PluginBundleNameInvalid(entry));
    return join(this.directory(pluginId), entry);
  }

  remove(pluginId: string): Promise<void> {
    return rm(this.directory(pluginId), { recursive: true, force: true });
  }

  private directory(pluginId: string): string {
    if (!KEBAB_CASE.test(pluginId))
      throw new Error(Errors.PluginIdInvalid(pluginId));
    return join(this.root, pluginId);
  }
}
