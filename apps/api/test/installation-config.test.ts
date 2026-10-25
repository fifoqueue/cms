import { describe, expect, test } from 'bun:test';
import { Errors } from '#api/shared/errors';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '#api/config';
import {
  readInstallationConfig,
  saveInstallationConfig,
} from '#api/infra/installation/config-store';
import { databaseUrl } from '#api/infra/installation/database';

describe('Installation configuration', () => {
  test('starts without DATABASE_URL but does not silently accept broken explicit configuration', () => {
    expect(loadConfig({})).toMatchObject({ API_PORT: 4000 });
    expect(loadConfig({}).DATABASE_URL).toBeUndefined();
    expect(() => loadConfig({ DATABASE_URL: '' })).toThrow(
      'Invalid configuration',
    );
    expect(() => loadConfig({ DATABASE_URL: 'file:///secret' })).toThrow(
      'Invalid configuration',
    );
    expect(
      loadConfig({ DATABASE_URL: 'mariadb://cms:password@localhost/cms' })
        .DATABASE_URL,
    ).toBe('mariadb://cms:password@localhost/cms');
  });

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

  test('concurrent configuration writes publish exactly one complete configuration', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cms-install-race-'));
    const path = join(directory, 'config.json');
    const urls = [
      'mysql://first:secret@localhost/first',
      'mysql://second:secret@localhost/second',
    ];
    try {
      const results = await Promise.allSettled(
        urls.map((url) => saveInstallationConfig(url, path)),
      );
      expect(
        results.filter((result) => result.status === 'fulfilled'),
      ).toHaveLength(1);
      expect(readInstallationConfig(path)?.DATABASE_URL).toBe(
        urls[results.findIndex((result) => result.status === 'fulfilled')],
      );
    } finally {
      await rm(directory, { recursive: true });
    }
  });

  test('encodes credentials and supports IPv6 without URL query injection', () => {
    const url = new URL(
      databaseUrl({
        host: '::1',
        username: 'user@host',
        password: 'p@ss:/?#%',
        database: 'site',
      }),
    );
    expect(url.protocol).toBe('mysql:');
    expect(url.hostname).toBe('[::1]');
    expect(url.port).toBe('3306');
    expect(decodeURIComponent(url.username)).toBe('user@host');
    expect(decodeURIComponent(url.password)).toBe('p@ss:/?#%');
    expect(url.pathname).toBe('/site');
    expect(url.search).toBe('');
    expect(url.hash).toBe('');
  });
});
