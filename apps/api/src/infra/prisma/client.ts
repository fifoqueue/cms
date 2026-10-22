import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { conflict } from '#api/shared/errors';
import { Prisma, PrismaClient } from '#api/infra/prisma/generated/client';

export type Database = PrismaClient;

/** Accepts `mysql://` (Prisma CLI) or `mariadb://` URLs. */
export const createDatabase = (url: string): Database =>
  new PrismaClient({ adapter: new PrismaMariaDb(url) });

/** Maps unique-constraint violations to `conflict`. */
export const guardUnique = async <T>(
  task: () => Promise<T>,
  message: string,
): Promise<T> => {
  try {
    return await task();
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    )
      throw conflict(message);
    throw error;
  }
};

/**
 * Takes the row lock named `key` in `settings` until the transaction ends. Serializes writers
 * that must see a stable view (counts, hierarchies) across API processes. Make it the first
 * statement of the transaction.
 */
export const lockSetting = async (
  tx: Prisma.TransactionClient,
  key: string,
) => {
  await tx.$executeRaw`INSERT INTO settings (\`key\`, value) VALUES (${key}, 'true') ON DUPLICATE KEY UPDATE value = 'true'`;
};
