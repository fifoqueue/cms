import { describe, expect, test } from 'bun:test';
import type { InstallCompleteInput, SessionGrant } from '@cms/sdk';
import { InstallationService } from '../src/domain/installation/installation-service';
import type { InstallationBackend } from '../src/domain/installation/installation-service';
import { createInstallerApp } from '../src/http/app';
import { recordingLogger } from './support/memory';

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
  user: { id: 'admin', name: '관리자', email: 'admin@example.com' },
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

  test('validates all inputs and passes no installation key to database configuration', async () => {
    const { backend, service } = fixture();
    await expect(
      service.database({ ...database, host: 'localhost/evil' }),
    ).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(
      service.database({ ...database, port: 0 }),
    ).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(
      service.complete({
        ...completion,
        site: { ...completion.site, title: '' },
      }),
    ).rejects.toMatchObject({ code: 'invalid_input' });
    let received: unknown;
    const original = backend.configure.bind(backend);
    backend.configure = async (...args: unknown[]) => {
      received = args[0];
      await original();
    };
    await service.database(database);
    const expected = { ...database };
    Reflect.deleteProperty(expected, 'token');
    expect(received).toEqual(expected);
  });

  test('failed configuration and completion can be retried without advancing state', async () => {
    const { backend, service } = fixture();
    backend.failure = true;
    await expect(service.database(database)).rejects.toThrow(
      'database unavailable',
    );
    expect((await service.status()).databaseConfigured).toBe(false);
    backend.failure = false;
    await service.database(database);
    backend.failure = true;
    await expect(service.complete(completion)).rejects.toThrow(
      'transaction rolled back',
    );
    expect((await service.status()).setupRequired).toBe(true);
    backend.failure = false;
    await service.complete(completion);
    expect((await service.status()).setupRequired).toBe(false);
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

  test('existing administrators cannot be replaced', async () => {
    const { backend, service } = fixture();
    backend.connected = true;
    backend.installed = true;
    await expect(service.complete(completion)).rejects.toMatchObject({
      code: 'conflict',
    });
    expect(backend.completions).toBe(0);
  });
});

describe('Installation HTTP routes', () => {
  test('status exposes no secrets, malformed JSON fails, and both mutations require a key', async () => {
    const { service } = fixture();
    const app = await createInstallerApp({
      services: { installation: service },
      logger: recordingLogger().logger,
    });
    const request = (path: string, body?: unknown) =>
      app.fetch(
        new Request(
          `http://localhost/api/v1/${path}`,
          body === undefined
            ? {}
            : {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(body),
              },
        ),
      );
    expect(await (await request('install/status')).json()).toEqual({
      databaseConfigured: false,
      setupRequired: true,
    });
    const denied = await request('install/database', {
      ...database,
      token: 'wrong',
    });
    expect(denied.status).toBe(401);
    expect(await denied.text()).not.toContain(database.password);
    expect((await request('install/database', database)).status).toBe(200);
    expect(
      (await request('install/complete', { ...completion, token: 'wrong' }))
        .status,
    ).toBe(401);
    expect((await request('install/complete', completion)).status).toBe(201);
    expect((await request('install/complete', completion)).status).toBe(409);
    expect((await request('auth/setup', completion.admin)).status).toBe(404);
    expect(
      (
        await app.fetch(
          new Request('http://localhost/api/v1/install/database', {
            method: 'POST',
            body: '{',
          }),
        )
      ).status,
    ).toBe(400);
  });
});
