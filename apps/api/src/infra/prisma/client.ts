import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { conflict } from '../../shared/errors';
import { Prisma, PrismaClient } from './generated/client';

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
