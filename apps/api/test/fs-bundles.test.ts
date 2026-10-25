import { afterAll, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FsPluginPackageStore } from '#api/infra/plugins/fs-package-store';

const root = await mkdtemp(join(tmpdir(), 'cms-plugins-'));
afterAll(() => rm(root, { recursive: true, force: true }));

describe('file system bundles', () => {
  test('refuses path traversal through ids or entries', () => {
    const store = new FsPluginPackageStore(root);
    expect(() => store.locate('../etc', 'x.js')).toThrow();
    expect(() => store.locate('demo', '../../x.js')).toThrow();
  });
});
