import { spawn } from 'bun';
import { fileURLToPath } from 'node:url';
import type { DatabaseSetupInput } from '@cms/sdk';
import { createDatabase } from '#api/infra/prisma/client';
import { invalidInput, Errors } from '#api/shared/errors';
import { API_DIRECTORY } from '#api/infra/installation/config-store';

export const databaseUrl = (input: DatabaseSetupInput) => {
  const host =
    input.host.includes(':') && !input.host.startsWith('[')
      ? `[${input.host}]`
      : input.host;
  return `mysql://${encodeURIComponent(input.username)}:${encodeURIComponent(input.password)}@${host}:${input.port ?? 3306}/${encodeURIComponent(input.database)}`;
};

/** Credentials only travel through the child environment, never argv or logs. */
export const prepareDatabase = async (url: string) => {
  const db = createDatabase(url);
  try {
    await db.$queryRaw`SELECT 1`;
  } catch {
    throw invalidInput(Errors.InstallDatabaseUnreachable);
  } finally {
    await db.$disconnect();
  }
  const migration = spawn({
    cmd: [
      process.execPath,
      fileURLToPath(import.meta.resolve('prisma/build/index.js')),
      'migrate',
      'deploy',
    ],
    cwd: API_DIRECTORY,
    env: { ...process.env, DATABASE_URL: url.replace(/^mariadb:/, 'mysql:') },
    stdout: 'ignore',
    stderr: 'ignore',
    timeout: 120_000,
  });
  if ((await migration.exited) !== 0)
    throw invalidInput(Errors.InstallMigrationFailed);
};
