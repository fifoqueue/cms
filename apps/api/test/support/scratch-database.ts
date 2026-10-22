import { fileURLToPath } from 'node:url';
import { createDatabase } from '#api/infra/prisma/client';
import type { Database } from '#api/infra/prisma/client';

const API_DIRECTORY = fileURLToPath(new URL('../..', import.meta.url));
const PRISMA_CLI = fileURLToPath(import.meta.resolve('prisma/build/index.js'));

/**
 * A uniquely named MariaDB database with every migration applied, on the server of
 * `CMS_TEST_DATABASE_URL` (an account allowed to create databases). The database named in the
 * URL is never used; `drop` removes the scratch database.
 */
export const scratchDatabase = async (serverUrl: string, prefix: string) => {
  const name = `${prefix}_${crypto.randomUUID().replaceAll('-', '')}`;
  const urlFor = (database: string) => {
    const url = new URL(serverUrl);
    url.pathname = `/${database}`;
    return url.href.replace(/^mariadb:/, 'mysql:');
  };
  const server = createDatabase(urlFor('information_schema'));
  await server.$executeRawUnsafe(
    `CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  );
  const child = Bun.spawn({
    cmd: [process.execPath, PRISMA_CLI, 'migrate', 'deploy'],
    cwd: API_DIRECTORY,
    env: { ...process.env, DATABASE_URL: urlFor(name) },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if ((await child.exited) !== 0) {
    await server.$executeRawUnsafe(`DROP DATABASE \`${name}\``);
    await server.$disconnect();
    throw new Error(
      `migrate deploy failed\n${await new Response(child.stderr).text()}`,
    );
  }
  const db: Database = createDatabase(urlFor(name));
  return {
    db,
    drop: async () => {
      await db.$disconnect();
      await server.$executeRawUnsafe(`DROP DATABASE \`${name}\``);
      await server.$disconnect();
    },
  };
};
