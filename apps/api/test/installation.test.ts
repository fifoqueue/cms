import { describe, expect, test } from 'bun:test';
import type { InstallCompleteInput, SessionGrant } from '@cms/sdk';
import { InstallationService } from '#api/domain/installation/installation-service';
import type { InstallationBackend } from '#api/domain/installation/installation-service';

const key = 'installation-test-key';
const database = {
  token: key,
  host: 'localhost',
  port: 3306,
  database: 'cms',
  username: 'cms',
  password: 'database-secret',
};
const completion: InstallCompleteInput = {
  token: key,
  siteUrl: 'https://cms.example.com',
  admin: {
    name: '관리자',
    email: 'admin@example.com',
    password: 'long-password',
  },
  site: { title: '새 사이트', description: '설명', locale: 'ko' },
};
const grant: SessionGrant = {
  token: 'session-token',
  expiresAt: '2030-01-01T00:00:00.000Z',
  user: {
    id: 'admin',
    name: '관리자',
    email: 'admin@example.com',
    role: 'administrator',
    slug: 'admin',
    bio: '',
    locale: '',
  },
};

/** Same durable-configuration / atomic-completion contract as the DB adapter. */
class MemoryInstallation implements InstallationBackend {
  connected = false;
  installed = false;
  failure = false;
  configurations = 0;
  completions = 0;
  configured = () => this.connected;
  setupRequired = async () => !this.installed;
  async configure() {
    this.configurations++;
    if (this.failure) throw new Error('database unavailable');
    this.connected = true;
  }
  async complete() {
    this.completions++;
    if (this.failure) throw new Error('transaction rolled back');
    this.installed = true;
    return grant;
  }
}

const fixture = () => {
  const backend = new MemoryInstallation();
  const service = new InstallationService(backend, (token) => token === key);
  return { backend, service };
};

describe('InstallationService', () => {
  test('walks through database configuration and installation, then locks both writes', async () => {
    const { backend, service } = fixture();
    expect(await service.status()).toEqual({
      databaseConfigured: false,
      setupRequired: true,
    });
    expect(await service.database(database)).toEqual({
      databaseConfigured: true,
      setupRequired: true,
    });
    expect(await service.complete(completion)).toEqual(grant);
    expect(await service.status()).toEqual({
      databaseConfigured: true,
      setupRequired: false,
    });
    await expect(service.database(database)).rejects.toMatchObject({
      code: 'conflict',
    });
    await expect(service.complete(completion)).rejects.toMatchObject({
      code: 'conflict',
    });
    expect(backend.configurations).toBe(1);
    expect(backend.completions).toBe(1);
  });

  test('requires the console key before any side effect', async () => {
    const { backend, service } = fixture();
    await expect(
      service.database({ ...database, token: 'wrong' }),
    ).rejects.toMatchObject({ code: 'unauthorized' });
    await expect(
      service.complete({ ...completion, token: 'wrong' }),
    ).rejects.toMatchObject({ code: 'unauthorized' });
    expect(backend.configurations).toBe(0);
    expect(backend.completions).toBe(0);
    await expect(service.complete(completion)).rejects.toMatchObject({
      code: 'conflict',
    });
  });

  test('rejects overlapping installation requests', async () => {
    const { backend, service } = fixture();
    const gate = Promise.withResolvers<void>();
    backend.configure = async () => {
      await gate.promise;
      backend.connected = true;
    };
    const first = service.database(database);
    await expect(service.database(database)).rejects.toMatchObject({
      code: 'conflict',
    });
    await expect(service.complete(completion)).rejects.toMatchObject({
      code: 'conflict',
    });
    gate.resolve();
    await first;
    await service.complete(completion);
  });

  test('resumes configured databases and never treats an outage as a new installation', async () => {
    const { backend } = fixture();
    backend.connected = true;
    const restarted = new InstallationService(
      backend,
      (token) => token === 'new-key',
    );
    expect(await restarted.status()).toEqual({
      databaseConfigured: true,
      setupRequired: true,
    });
    await expect(restarted.complete(completion)).rejects.toMatchObject({
      code: 'unauthorized',
    });
    await restarted.complete({ ...completion, token: 'new-key' });
    backend.setupRequired = async () => {
      throw new Error('connection lost');
    };
    await expect(restarted.status()).rejects.toThrow('connection lost');
    expect(backend.configured()).toBe(true);
  });
});
