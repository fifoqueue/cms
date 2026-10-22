import { checkArchivePaths } from '#api/infra/prisma/archive-paths';
import { createHash } from 'node:crypto';
import type { PermalinkSettings } from '@cms/sdk';
import { readPermalinkSettings } from '#api/domain/permalinks/content-path';
import type { PermalinkSubject } from '#api/domain/permalinks/content-path';
import {
  pathChanges,
  planPathChanges,
  regenerationEntry,
} from '#api/domain/permalinks/path-plan';
import type {
  PathChange,
  PathEntry,
  PathPlan,
  StoredPath,
} from '#api/domain/permalinks/path-plan';
import type { PermalinkRepository } from '#api/domain/permalinks/permalink-repository';
import { guardUnique } from '#api/infra/prisma/client';
import type { Database } from '#api/infra/prisma/client';
import { Prisma } from '#api/infra/prisma/generated/client';
import { Errors } from '#api/shared/errors';

/**
 * `content_paths` holds every content path as ASCII bytes (`VARBINARY`) keyed by its SHA-256
 * (`BINARY(32)`), so uniqueness and lookups compare bytes exactly; a lookup also verifies the
 * stored path. A row is current when `current_for` equals its `content_id` (unique: one current
 * path per item), otherwise a permanent redirect. Rows go with their content (ON DELETE CASCADE).
 */

const SETTINGS_KEY = 'permalinks';
/** Row in `settings` whose lock serializes path writes and settings changes. */
const LOCK_KEY = 'permalinks.lock';
const BATCH = 500;

type Transaction = Prisma.TransactionClient;

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

export const pathHash = (path: string) =>
  new Uint8Array(createHash('sha256').update(path, 'utf8').digest());

/** The stored `content_paths.path` bytes as the path string. */
export const decodePath = (bytes: Uint8Array) => decoder.decode(bytes);

const chunks = <T>(items: readonly T[]) =>
  Array.from({ length: Math.ceil(items.length / BATCH) }, (_, index) =>
    items.slice(index * BATCH, (index + 1) * BATCH),
  );

/**
 * Takes the permalink lock. Must be the first statement of every transaction that writes paths,
 * so its reads (settings, paths) see everything committed before the lock was granted.
 */
export const lockPermalinks = async (tx: Transaction) => {
  await tx.$executeRaw`INSERT INTO settings (\`key\`, value) VALUES (${LOCK_KEY}, 'true') ON DUPLICATE KEY UPDATE value = 'true'`;
};

const readSettings = async (db: Pick<Transaction, 'setting'>) => {
  const row = await db.setting.findUnique({ where: { key: SETTINGS_KEY } });

  try {
    return readPermalinkSettings(row && JSON.parse(row.value));
  } catch {
    return readPermalinkSettings(undefined);
  }
};

/** Stored rows of `paths`, keyed by path. */
const findOwners = async (tx: Transaction, paths: readonly string[]) => {
  const owners = new Map<string, StoredPath>();

  for (const batch of chunks(paths)) {
    const rows = await tx.contentPath.findMany({
      where: { pathHash: { in: batch.map(pathHash) } },
      select: { path: true, contentId: true, currentFor: true },
    });

    for (const row of rows) {
      const path = decodePath(row.path);

      owners.set(path, {
        path,
        contentId: row.contentId,
        current: row.currentFor !== null,
      });
    }
  }

  return owners;
};

const applyPlan = async (tx: Transaction, plan: PathPlan) => {
  for (const batch of chunks(plan.release))
    await tx.contentPath.deleteMany({
      where: { pathHash: { in: batch.map(pathHash) } },
    });
  for (const batch of chunks(plan.demote))
    await tx.contentPath.updateMany({
      where: { pathHash: { in: batch.map(pathHash) } },
      data: { currentFor: null },
    });
  // Promoted rows are the content's own redirects, so `current_for` becomes their `content_id`.
  for (const batch of chunks(plan.promote))
    await tx.$executeRaw`UPDATE content_paths SET current_for = content_id WHERE path_hash IN (${Prisma.join(
      batch.map(({ path }) => pathHash(path)),
    )})`;
  for (const batch of chunks(plan.insert))
    await guardUnique(
      () =>
        tx.contentPath.createMany({
          data: batch.map(({ path, contentId }) => ({
            pathHash: pathHash(path),
            path: encoder.encode(path),
            contentId,
            currentFor: contentId,
          })),
        }),
      Errors.PathConflict,
    );
};

const applyChanges = async (tx: Transaction, changes: PathChange[]) => {
  await checkArchivePaths(
    tx,
    changes.map((change) => change.to),
  );
  return applyPlan(
    tx,
    planPathChanges(
      changes,
      await findOwners(
        tx,
        changes.map(({ to }) => to),
      ),
    ),
  );
};

/**
 * Sets the current path of `subject` (already written in `tx`) from the stored settings and
 * returns it. Call it inside the content insert/update transaction, after `lockPermalinks` and
 * the content row write. `retainPrevious`: the stored record before this write had `publishedAt`
 * set (it was ever public), so its old path stays as a redirect. Throws `invalid_input`/`conflict`
 * like `planPathChanges`; the caller's transaction then rolls back the content write too.
 */
/** Hydrate address tokens from the same transaction as the content/metadata write. */
const addressEntries = async (
  tx: Transaction,
  where: Prisma.ContentWhereInput = {},
): Promise<PathEntry[]> => {
  const rows = await tx.content.findMany({
    where,
    select: {
      id: true,
      type: true,
      slug: true,
      title: true,
      parentId: true,
      publishedAt: true,
      createdAt: true,
      currentPath: { select: { path: true } },
      author: { select: { slug: true } },
      terms: {
        select: { term: { select: { id: true, name: true, taxonomy: true } } },
      },
    },
    orderBy: { id: 'asc' },
  });
  const [pages, categories] = await Promise.all([
    rows.some((row) => row.parentId)
      ? tx.content.findMany({
          where: { type: 'page' },
          select: { id: true, slug: true, parentId: true },
        })
      : [],
    rows.some((row) =>
      row.terms.some(({ term }) => term.taxonomy === 'category'),
    )
      ? tx.taxonomyTerm.findMany({
          where: { taxonomy: 'category' },
          select: { id: true, slug: true, parentId: true },
        })
      : [],
  ]);
  const pageMap = new Map(pages.map((page) => [page.id, page]));
  const categoryMap = new Map(categories.map((term) => [term.id, term]));
  const chain = (
    id: string | null,
    nodes: ReadonlyMap<string, { slug: string; parentId: string | null }>,
  ) => {
    const slugs: string[] = [];
    const seen = new Set<string>();
    while (id) {
      if (seen.has(id) || seen.size >= 100)
        throw new Error(Errors.ContentParentInvalid);
      seen.add(id);
      const node = nodes.get(id);
      if (!node) break;
      slugs.unshift(node.slug);
      id = node.parentId;
    }
    return slugs;
  };
  return rows.map(({ currentPath, author, terms, ...subject }) => {
    const category = terms
      .filter(({ term }) => term.taxonomy === 'category')
      .sort((a, b) =>
        a.term.name < b.term.name
          ? -1
          : a.term.name > b.term.name
            ? 1
            : a.term.id.localeCompare(b.term.id),
      )[0]?.term.id;
    return regenerationEntry(
      {
        ...subject,
        author: author.slug,
        parents: chain(subject.parentId, pageMap),
        category: chain(category ?? null, categoryMap),
      },
      currentPath && decodePath(currentPath.path),
    );
  });
};

/** Caller holds the permalink lock; every affected old URL is retained atomically. */
export const refreshContentPaths = async (
  tx: Transaction,
  where: Prisma.ContentWhereInput = {},
) => {
  const settings = await readSettings(tx);
  await applyChanges(
    tx,
    pathChanges(settings, await addressEntries(tx, where)),
  );
};

export const assignContentPath = async (
  tx: Transaction,
  subject: Pick<PermalinkSubject, 'id' | 'type'>,
  retainPrevious: boolean,
): Promise<string> => {
  const settings = await readSettings(tx);
  // Parent edits can move descendants. One plan prevents partially updated page trees.
  const entries = await addressEntries(
    tx,
    subject.type === 'page' ? { type: 'page' } : { id: subject.id },
  );
  const own = entries.find((entry) => entry.subject.id === subject.id)!;
  own.retainPrevious = retainPrevious;
  await applyChanges(tx, pathChanges(settings, entries));
  const current = await tx.contentPath.findUnique({
    where: { currentFor: subject.id },
    select: { path: true },
  });
  if (!current) throw new Error(Errors.ContentPathMissing);
  return decodePath(current.path);
};

export class PrismaPermalinkRepository implements PermalinkRepository {
  constructor(private readonly db: Database) {}

  readSettings() {
    return readSettings(this.db);
  }

  async findByPath(path: string) {
    const row = await this.db.contentPath.findUnique({
      where: { pathHash: pathHash(path) },
      select: { path: true, contentId: true, currentFor: true },
    });

    return row && decodePath(row.path) === path
      ? { contentId: row.contentId, current: row.currentFor !== null }
      : null;
  }

  async saveSettings(settings: PermalinkSettings) {
    await this.db.$transaction(
      async (tx) => {
        await lockPermalinks(tx);

        await applyChanges(tx, pathChanges(settings, await addressEntries(tx)));
        await tx.setting.upsert({
          where: { key: SETTINGS_KEY },
          create: { key: SETTINGS_KEY, value: JSON.stringify(settings) },
          update: { value: JSON.stringify(settings) },
        });
      },
      { timeout: 120_000 },
    );
  }
}
