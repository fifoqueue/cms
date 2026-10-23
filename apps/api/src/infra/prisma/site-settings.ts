import { archivePathsStateSchema } from '@cms/sdk';
import type { ArchivePathsState, SiteSettings } from '@cms/sdk';
import { createHash } from 'node:crypto';
import type { SiteSettingsWriter } from '#api/domain/site/site-service';
import { readSiteSettings } from '#api/domain/site/site-service';
import { lockSetting } from '#api/infra/prisma/client';
import type { Database } from '#api/infra/prisma/client';
import type { Prisma } from '#api/infra/prisma/generated/client';
import { conflict, Errors } from '#api/shared/errors';

const SITE_KEY = 'site';
const ARCHIVE_KEY = 'permalink.archives';
const PATH_LOCK = 'permalinks.lock';
const encoder = new TextEncoder();

export const pathHash = (path: string) =>
  new Uint8Array(createHash('sha256').update(path, 'utf8').digest());

export const lockPublicPaths = (tx: Prisma.TransactionClient) =>
  lockSetting(tx, PATH_LOCK);

const loginPath = async (db: Pick<Database, 'setting'>) => {
  const row = await db.setting.findUnique({ where: { key: SITE_KEY } });
  return readSiteSettings(row ? JSON.parse(row.value) : undefined).loginPath;
};

const archives = async (
  db: Pick<Database, 'setting'>,
): Promise<ArchivePathsState> => {
  const row = await db.setting.findUnique({ where: { key: ARCHIVE_KEY } });
  const parsed = archivePathsStateSchema.safeParse(
    row ? JSON.parse(row.value) : {},
  );
  return parsed.success ? parsed.data : archivePathsStateSchema.parse({});
};

const archivePaths = (state: ArchivePathsState) => [
  ...Object.values(state.bases),
  ...state.history.category,
  ...state.history.tag,
];

const underArchive = (path: string, state: ArchivePathsState) =>
  archivePaths(state).some(
    (base) => path === base || path.startsWith(`${base}/`),
  );

const contentOwns = async (db: Pick<Database, 'contentPath'>, path: string) => {
  const expected = encoder.encode(path);
  const row = await db.contentPath.findUnique({
    where: {
      pathHash: pathHash(path),
    },
    select: { path: true },
  });
  return (
    !!row &&
    row.path.length === expected.length &&
    row.path.every((byte, index) => byte === expected[index])
  );
};

const fallbackLoginPath = async (
  db: Pick<Database, 'contentPath'>,
  state: ArchivePathsState,
) => {
  for (let suffix = 0; ; suffix += 1) {
    const path = suffix ? `/cms-login-${suffix}` : '/cms-login';
    if (!underArchive(path, state) && !(await contentOwns(db, path)))
      return path;
  }
};

const effectiveLoginPath = async (
  db: Pick<Database, 'contentPath'>,
  path: string,
  state: ArchivePathsState,
) =>
  (await contentOwns(db, path)) || underArchive(path, state)
    ? fallbackLoginPath(db, state)
    : path;

/** Called under the public-path lock before content claims new paths. */
export const checkLoginPath = async (
  tx: Prisma.TransactionClient,
  paths: readonly string[],
) => {
  const reserved = await effectiveLoginPath(
    tx,
    await loginPath(tx),
    await archives(tx),
  );
  if (paths.includes(reserved)) throw conflict(Errors.PathConflict);
};

/** Called under the public-path lock before archive bases change. */
export const checkLoginArchives = async (
  tx: Prisma.TransactionClient,
  state: ArchivePathsState,
) => {
  const configured = await loginPath(tx);
  const current = await archives(tx);
  const occupied =
    (await contentOwns(tx, configured)) || underArchive(configured, current);
  const reserved = await effectiveLoginPath(tx, configured, current);
  if (
    (!occupied && underArchive(configured, state)) ||
    underArchive(reserved, state)
  )
    throw conflict(Errors.PathConflict);
};

/** Stores general settings and reserves the login route in the same path transaction. */
export class PrismaSiteSettingsWriter implements SiteSettingsWriter {
  constructor(private readonly db: Database) {}

  async publicLoginPath(path: string) {
    return effectiveLoginPath(this.db, path, await archives(this.db));
  }

  async save(site: SiteSettings) {
    await this.db.$transaction(async (tx) => {
      await lockPublicPaths(tx);
      if (
        (await contentOwns(tx, site.loginPath)) ||
        underArchive(site.loginPath, await archives(tx))
      )
        throw conflict(Errors.PathConflict);
      await tx.setting.upsert({
        where: { key: SITE_KEY },
        create: { key: SITE_KEY, value: JSON.stringify(site) },
        update: { value: JSON.stringify(site) },
      });
    });
  }
}
