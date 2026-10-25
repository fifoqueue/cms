import { describe, expect, test } from 'bun:test';
import { Errors } from '#api/shared/errors';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  readInstallationConfig,
  saveInstallationConfig,
} from '#api/infra/installation/config-store';

describe('Installation configuration', () => {
  test('persists credentials atomically across reads without replacing an existing installation', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cms-install-config-'));
    const path = join(directory, 'data/config.json');
    const url = 'mysql://cms:secret@localhost:3306/cms';
    try {
      expect(readInstallationConfig(path)).toBeUndefined();
      await saveInstallationConfig(url, path);
      expect(readInstallationConfig(path)).toEqual({ DATABASE_URL: url });
      const before = await readFile(path, 'utf8');
      await expect(
        saveInstallationConfig('mysql://other:other@localhost/other', path),
      ).rejects.toThrow();
      expect(await readFile(path, 'utf8')).toBe(before);
      if (process.platform !== 'win32')
        expect((await stat(path)).mode & 0o777).toBe(0o600);
      await writeFile(path, '{"DATABASE_URL":');
      expect(() => readInstallationConfig(path)).toThrow(
        Errors.InstallConfigCorrupt,
      );
    } finally {
      await rm(directory, { recursive: true });
    }
  });
});
