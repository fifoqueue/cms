import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { fileURLToPath } from 'node:url';
import type { SsoTransactionRecord } from '#api/domain/auth/sso-ports';
import {
  PrismaSessionRepository,
  PrismaUserRepository,
} from '#api/infra/prisma/auth-repositories';
import { createDatabase } from '#api/infra/prisma/client';
import { userRecord } from '#test/support/memory';
import type { Database } from '#api/infra/prisma/client';
import {
  PrismaIdentityRepository,
  PrismaSsoTransactionRepository,
} from '#api/infra/prisma/sso-repositories';

/**
 * The SSO Prisma adapters on a real MariaDB. Opt in with `CMS_TEST_DATABASE_URL`, a server
 * account allowed to create databases. The test creates its own uniquely named database, applies
 * every migration to it with `prisma migrate deploy`, and drops it afterwards. The database named
 * in the URL is never used.
 */
const serverUrl = process.env.CMS_TEST_DATABASE_URL;
const API_DIRECTORY = fileURLToPath(new URL('..', import.meta.url));
const PRISMA_CLI = fileURLToPath(import.meta.resolve('prisma/build/index.js'));
const SCRATCH = `cms_sso_test_${crypto.randomUUID().replaceAll('-', '')}`;
const ISSUER = 'https://id.example.com';
const SLOW = 60_000;

const urlFor = (database: string) => {
  const url = new URL(serverUrl!);
  url.pathname = `/${database}`;
  return url.href.replace(/^mariadb:/, 'mysql:');
};

/** Runs the Prisma CLI against the scratch database; credentials travel only in the env. */
const prismaCli = async (...args: string[]) => {
  const child = Bun.spawn({
    cmd: [process.execPath, PRISMA_CLI, ...args],
    cwd: API_DIRECTORY,
    env: { ...process.env, DATABASE_URL: urlFor(SCRATCH) },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [code, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { code, output: `${stdout}\n${stderr}` };
};

const hash = (label: string) => label.padEnd(64, '0');

const MIGRATIONS = fileURLToPath(
  new URL('../prisma/migrations/', import.meta.url),
);

/** The statements of one migration, in order. */
const statementsOf = async (migration: string) =>
  (await Bun.file(`${MIGRATIONS}${migration}/migration.sql`).text())
    .split(/;\s*$/m)
    .map((statement) =>
      statement
        .split('\n')
        .filter((line) => !line.trim().startsWith('--'))
        .join('\n')
        .trim(),
    )
    .filter(Boolean);

describe.skipIf(!serverUrl)('SSO Prisma adapters on MariaDB', () => {
  let server: Database;
  let db: Database;
  let created = false;

  beforeAll(async () => {
    server = createDatabase(urlFor('information_schema'));
    await server.$executeRawUnsafe(
      `CREATE DATABASE \`${SCRATCH}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
    created = true;

    const deploy = await prismaCli('migrate', 'deploy');
    if (deploy.code !== 0)
      throw new Error(`migrate deploy failed\n${deploy.output}`);

    db = createDatabase(urlFor(SCRATCH));
  }, SLOW);

  afterAll(async () => {
    await db?.$disconnect();
    if (created) await server.$executeRawUnsafe(`DROP DATABASE \`${SCRATCH}\``);
    await server?.$disconnect();
  }, SLOW);

  const users = async (...ids: string[]) => {
    const repository = new PrismaUserRepository(db);
    for (const id of ids)
      await repository.insert(userRecord({ id, createdAt: new Date() }));
  };

  test(
    'the migrations produce exactly the Prisma schema',
    async () => {
      const diff = await prismaCli(
        'migrate',
        'diff',
        '--from-config-datasource',
        '--to-schema',
        'prisma/schema.prisma',
        '--exit-code',
      );
      expect({
        code: diff.code,
        output: diff.code === 0 ? '' : diff.output,
      }).toEqual({
        code: 0,
        output: '',
      });
    },
    SLOW,
  );

  test('identities are stored, looked up and kept unique byte for byte', async () => {
    const identities = new PrismaIdentityRepository(db);
    await users('case-1', 'case-2', 'case-3', 'case-4', 'case-5');

    const link = (
      id: string,
      userId: string,
      subject: string,
      issuer = ISSUER,
    ) =>
      identities.link({ id, issuer, subject, userId, createdAt: new Date() });

    await link('case-i1', 'case-1', 'Alice');
    await link('case-i2', 'case-2', 'alice');
    await link('case-i3', 'case-3', 'Alice ');
    await link('case-i4', 'case-4', 'Alice', ISSUER.toUpperCase());

    expect(await identities.find(ISSUER, 'Alice')).toMatchObject({
      id: 'case-i1',
      subject: 'Alice',
    });
    expect(await identities.find(ISSUER, 'alice')).toMatchObject({
      id: 'case-i2',
      subject: 'alice',
    });
    expect(await identities.find(ISSUER, 'Alice ')).toMatchObject({
      id: 'case-i3',
      subject: 'Alice ',
    });
    expect(await identities.find(ISSUER.toUpperCase(), 'Alice')).toMatchObject({
      id: 'case-i4',
    });
    expect(await identities.find(ISSUER, 'ALICE')).toBeNull();
    expect(await identities.findByUser('case-1')).toEqual({
      id: 'case-i1',
      issuer: ISSUER,
      subject: 'Alice',
      userId: 'case-1',
      createdAt: expect.any(Date),
    });

    await expect(link('case-i5', 'case-5', 'alice')).rejects.toMatchObject({
      code: 'conflict',
    });
  });

  test('sessions die with their identity, and a removed identity cannot get new ones', async () => {
    const identities = new PrismaIdentityRepository(db);
    const sessions = new PrismaSessionRepository(db);
    await users('rev-1', 'rev-2');
    const expiresAt = new Date(Date.now() + 60_000);
    const linkAs = (id: string, userId: string, subject: string) =>
      identities.link({
        id,
        issuer: ISSUER,
        subject,
        userId,
        createdAt: new Date(),
      });

    await linkAs('rev-i1', 'rev-1', 'rev-subject-1');
    await sessions.insert({
      tokenHash: hash('rev-sso'),
      userId: 'rev-1',
      identityId: 'rev-i1',
      createdAt: new Date(),
      expiresAt,
    });
    await sessions.insert({
      tokenHash: hash('rev-password'),
      userId: 'rev-1',
      identityId: null,
      createdAt: new Date(),
      expiresAt,
    });

    await identities.unlink('rev-1');

    expect(await sessions.find(hash('rev-sso'))).toBeNull();
    expect(await sessions.find(hash('rev-password'))).toMatchObject({
      identityId: null,
    });

    // The sign-in that lost the race against the unlink.
    await expect(
      sessions.insert({
        tokenHash: hash('rev-late'),
        userId: 'rev-1',
        identityId: 'rev-i1',
        createdAt: new Date(),
        expiresAt,
      }),
    ).rejects.toMatchObject({ code: 'unauthorized' });
    expect(await sessions.find(hash('rev-late'))).toBeNull();

    // Replacing a link revokes the previous link's sessions too.
    await linkAs('rev-i2', 'rev-2', 'rev-subject-2');
    await sessions.insert({
      tokenHash: hash('rev-old'),
      userId: 'rev-2',
      identityId: 'rev-i2',
      createdAt: new Date(),
      expiresAt,
    });
    await linkAs('rev-i3', 'rev-2', 'rev-subject-3');
    expect(await sessions.find(hash('rev-old'))).toBeNull();
    expect(await identities.findByUser('rev-2')).toMatchObject({
      id: 'rev-i3',
    });
  });

  test(
    'the security migration keeps existing links and signs everyone out',
    async () => {
      const upgrade = `${SCRATCH}_upgrade`;
      await server.$executeRawUnsafe(
        `CREATE DATABASE \`${upgrade}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
      );
      const old = createDatabase(urlFor(upgrade));

      try {
        for (const migration of [
          '20261021000000_init',
          '20261022000000_oidc_sso',
        ])
          for (const statement of await statementsOf(migration))
            await old.$executeRawUnsafe(statement);

        await old.$executeRawUnsafe(
          "INSERT INTO users (id, email, name, password_hash) VALUES ('u1', 'u1@example.com', 'U1', 'x'), ('u2', 'u2@example.com', 'U2', 'x')",
        );
        await old.$executeRawUnsafe(
          `INSERT INTO user_identities (issuer, subject, user_id, created_at) VALUES ('${ISSUER}', 'Alice', 'u1', NOW(3)), ('${ISSUER}', 'Zoë ', 'u2', NOW(3))`,
        );
        await old.$executeRawUnsafe(
          `INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ('${hash('old-1')}', 'u1', NOW(3) + INTERVAL 1 DAY), ('${hash('old-2')}', 'u2', NOW(3) + INTERVAL 1 DAY)`,
        );
        await old.$executeRawUnsafe(
          `INSERT INTO sso_transactions (handle_hash, state, nonce, code_verifier, expires_at) VALUES ('${hash('old-tx')}', 's', 'n', 'v', NOW(3) + INTERVAL 5 MINUTE)`,
        );

        for (const statement of await statementsOf(
          '20261023000000_sso_exact_identity_sessions',
        ))
          await old.$executeRawUnsafe(statement);

        const identities = new PrismaIdentityRepository(old);
        const u1 = await identities.findByUser('u1');
        const u2 = await identities.findByUser('u2');

        expect(u1).toMatchObject({ issuer: ISSUER, subject: 'Alice' });
        expect(u2).toMatchObject({ issuer: ISSUER, subject: 'Zoë ' });
        expect(u1?.id).toMatch(/^[0-9a-f-]{36}$/);
        expect(u1?.id).not.toBe(u2?.id);
        expect(await identities.find(ISSUER, 'alice')).toBeNull();
        expect(await old.session.count()).toBe(0);
        expect(await old.ssoTransaction.count()).toBe(0);
        expect(await old.user.count()).toBe(2);
      } finally {
        await old.$disconnect();
        await server.$executeRawUnsafe(`DROP DATABASE \`${upgrade}\``);
      }
    },
    SLOW,
  );

  test(
    'admission keeps both bounds under concurrency and purges expired requests',
    async () => {
      const transactions = new PrismaSsoTransactionRepository(db);
      const now = new Date();
      const pending = (
        label: string,
        client: string,
        expiresAt = new Date(now.getTime() + 600_000),
      ): SsoTransactionRecord => ({
        handleHash: hash(label),
        state: 'state',
        nonce: 'nonce',
        codeVerifier: 'verifier',
        userId: null,
        clientKey: hash(client),
        expiresAt,
      });
      const limits = { total: 3, perClient: 2 };

      const flood = await Promise.all(
        Array.from({ length: 6 }, (_, index) =>
          transactions.admit(pending(`adm-a${index}`, 'client-a'), now, limits),
        ),
      );
      expect(flood.filter(Boolean)).toHaveLength(2);

      const others = await Promise.all(
        Array.from({ length: 4 }, (_, index) =>
          transactions.admit(
            pending(`adm-b${index}`, `client-b${index}`),
            now,
            limits,
          ),
        ),
      );
      expect(others.filter(Boolean)).toHaveLength(1);
      expect(await db.ssoTransaction.count()).toBe(3);

      // Once they expire, the next admission purges them first.
      const later = new Date(now.getTime() + 600_000);
      expect(
        await transactions.admit(
          pending('adm-c', 'client-a', new Date(later.getTime() + 600_000)),
          later,
          limits,
        ),
      ).toBe(true);
      expect(await db.ssoTransaction.count()).toBe(1);

      // A request can be taken once, even by concurrent callbacks.
      const taken = await Promise.all([
        transactions.take(hash('adm-c')),
        transactions.take(hash('adm-c')),
      ]);
      expect(taken.filter(Boolean)).toHaveLength(1);
    },
    SLOW,
  );
});
