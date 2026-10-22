import { archivePathsStateSchema } from '@cms/sdk';
import type { ArchiveBases, ArchivePathsState } from '@cms/sdk';
import type { ArchivePathRepository } from '#api/domain/permalinks/archive-paths';
import type { Database } from '#api/infra/prisma/client';
import type { Prisma } from '#api/infra/prisma/generated/client';
import { lockPermalinks } from '#api/infra/prisma/permalink-repository';
import { conflict, Errors } from '#api/shared/errors';

const KEY = 'permalink.archives';

export const readArchivePaths = async (
  db: Pick<Database, 'setting'>,
): Promise<ArchivePathsState> => {
  const row = await db.setting.findUnique({ where: { key: KEY } });
  const parsed = archivePathsStateSchema.safeParse(
    row ? JSON.parse(row.value) : {},
  );
  return parsed.success ? parsed.data : archivePathsStateSchema.parse({});
};

/** Content paths and archive prefixes share one lock and cannot take each other's addresses. */
export class PrismaArchivePaths implements ArchivePathRepository {
  constructor(private readonly db: Database) {}
  read() {
    return readArchivePaths(this.db);
  }

  async save(bases: ArchiveBases) {
    await this.db.$transaction(async (tx) => {
      await lockPermalinks(tx);
      const state = await readArchivePaths(tx);
      for (const taxonomy of ['category', 'tag'] as const) {
        const other = taxonomy === 'category' ? 'tag' : 'category';
        const base = bases[taxonomy];
        if (
          [state.bases[other], ...state.history[other]].some(
            (previous) =>
              base === previous ||
              base.startsWith(`${previous}/`) ||
              previous.startsWith(`${base}/`),
          )
        )
          throw conflict(Errors.PathConflict);
        const prefix = new TextEncoder().encode(`${base}/`);
        const existing = await tx.$queryRaw<
          { path: Uint8Array }[]
        >`SELECT path FROM content_paths WHERE LEFT(path, ${prefix.length}) = ${prefix} LIMIT 1`;
        if (existing.length) throw conflict(Errors.PathConflict);
        if (state.bases[taxonomy] !== base)
          state.history[taxonomy] = [
            ...new Set([...state.history[taxonomy], state.bases[taxonomy]]),
          ].filter((path) => path !== base);
      }
      const next = archivePathsStateSchema.parse({
        bases,
        history: state.history,
      });
      await tx.setting.upsert({
        where: { key: KEY },
        create: { key: KEY, value: JSON.stringify(next) },
        update: { value: JSON.stringify(next) },
      });
    });
  }
}

/** Called while holding the shared permalink lock, before writing any new content paths. */
export const checkArchivePaths = async (
  tx: Prisma.TransactionClient,
  paths: readonly string[],
) => {
  const state = await readArchivePaths(tx);
  const bases = [
    ...Object.values(state.bases),
    ...state.history.category,
    ...state.history.tag,
  ];
  if (paths.some((path) => bases.some((base) => path.startsWith(`${base}/`))))
    throw conflict(Errors.PathConflict);
};
