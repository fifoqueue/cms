import { afterAll, describe, expect, test } from 'bun:test';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FsPluginPackageStore } from '#api/infra/plugins/fs-package-store';
import { dynamicImportLoader } from '#api/infra/plugins/module-loader';

const root = await mkdtemp(join(tmpdir(), 'cms-plugins-'));
afterAll(() => rm(root, { recursive: true, force: true }));

const bundle = (version: string) =>
  `export const plugin = { manifest: { version: '${version}' }, activate() {} };`;

const versionAt = async (path: string) =>
  ((await dynamicImportLoader.load(path)) as { manifest: { version: string } })
    .manifest.version;

describe('file system bundles', () => {
  test('each upload is imported fresh and replaces the previous bundle once pruned', async () => {
    const store = new FsPluginPackageStore(root);

    const first = await store.commit(await store.stage(bundle('1')), 'demo');
    await first.prune();
    const v1 = await versionAt(store.locate('demo', first.entry));

    const second = await store.commit(await store.stage(bundle('2')), 'demo');
    expect((await readdir(join(root, 'demo'))).sort()).toEqual(
      [first.entry, second.entry].sort(),
    );
    await second.prune();
    const v2 = await versionAt(store.locate('demo', second.entry));

    expect([v1, v2]).toEqual(['1', '2']);
    expect(await readdir(join(root, 'demo'))).toEqual([second.entry]);

    await store.remove('demo');
    expect(await readdir(root)).not.toContain('demo');
  });

  test('an unpruned commit keeps both bundles loadable after a restart', async () => {
    const store = new FsPluginPackageStore(root);
    const current = await store.commit(await store.stage(bundle('1')), 'kept');
    await current.prune();

    const candidate = await store.commit(
      await store.stage(bundle('2')),
      'kept',
    );

    expect(await readdir(join(root, '.staging'))).toEqual([]);

    const restarted = new FsPluginPackageStore(root);
    expect([
      await versionAt(restarted.locate('kept', current.entry)),
      await versionAt(restarted.locate('kept', candidate.entry)),
    ]).toEqual(['1', '2']);

    await restarted.remove('kept');
  });

  test('refuses path traversal through ids or entries', () => {
    const store = new FsPluginPackageStore(root);
    expect(() => store.locate('../etc', 'x.js')).toThrow();
    expect(() => store.locate('demo', '../../x.js')).toThrow();
  });
});
