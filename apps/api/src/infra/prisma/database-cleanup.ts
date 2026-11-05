import type { DatabaseCleanupCounts, DatabaseTableSize } from '@cms/sdk';
import type { Actor } from '#api/domain/auth/authorization';
import type { CleanupStatus } from '#api/domain/comments/ports';
import type {
  CleanupCategory,
  CleanupPolicy,
  DatabaseCleanupStore,
} from '#api/domain/tools/database-cleanup';
import type { Database } from '#api/infra/prisma/client';
import { Prisma } from '#api/infra/prisma/generated/client';
import { lockPermalinks } from '#api/infra/prisma/permalink-repository';
import { checkDeleteGuard } from '#api/infra/prisma/revision-delete-guard';
import { invalidInput, Errors } from '#api/shared/errors';

/** The @@map names in prisma/schema.prisma; never includes other applications' tables. */
const TABLES = [
  'users',
  'passkeys',
  'totp_secrets',
  'user_identities',
  'sso_transactions',
  'sign_in_transactions',
  'recovery_codes',
  'sessions',
  'contents',
  'content_paths',
  'content_tombstones',
  'taxonomy_terms',
  'content_terms',
  'settings',
  'plugins',
  'plugin_data',
  'scheduled_tasks',
  'jobs',
  'rate_limit_buckets',
  'password_tokens',
  'api_tokens',
  'content_revisions',
  'media',
  'content_media',
  'term_media',
  'comments',
  'push_subscriptions',
  'notice_windows',
  'notice_dispatches',
  'search_outbox',
  'privacy_requests',
];

export class PrismaDatabaseCleanupStore implements DatabaseCleanupStore {
  constructor(
    private readonly db: Database,
    private readonly deletes: {
      content(id: string, actor: Actor): Promise<void>;
      /** Resolves false when the comment left `status` after it was selected. */
      comment(
        id: string,
        status: CleanupStatus,
        actor: Actor,
      ): Promise<boolean>;
      expired(now: Date, limit: number): Promise<number>;
      expiredCount(now: Date): Promise<number>;
    },
  ) {}

  private revisions(keep: number) {
    return Prisma.sql`SELECT id, content_id AS contentId FROM (
      SELECT id, content_id,
        ROW_NUMBER() OVER (PARTITION BY content_id ORDER BY created_at DESC, id DESC) AS position
      FROM content_revisions WHERE kind = 'revision'
    ) ranked WHERE position > ${keep} ORDER BY content_id, position`;
  }

  async counts(policy: CleanupPolicy): Promise<DatabaseCleanupCounts> {
    const [row] = await this.db.$queryRaw<{ total: bigint }[]>(
      Prisma.sql`SELECT COUNT(*) AS total FROM (${this.revisions(policy.keepLatest)}) candidates`,
    );

    return {
      revisions: Number(row!.total),
      autosaves: await this.db.contentRevision.count({
        where: { kind: 'autosave', createdAt: { lt: policy.autosavesBefore } },
      }),
      trashedContent: await this.db.content.count({
        where: { trashedAt: { not: null } },
      }),
      spamComments: await this.db.comment.count({ where: { status: 'spam' } }),
      trashedComments: await this.db.comment.count({
        where: { status: 'trash' },
      }),
      expired: await this.deletes.expiredCount(policy.now),
      optimize: (await this.tables()).length,
    };
  }

  async tables(): Promise<DatabaseTableSize[]> {
    const rows = await this.db.$queryRaw<
      {
        table: string;
        dataBytes: bigint;
        indexBytes: bigint;
        freeBytes: bigint;
      }[]
    >(Prisma.sql`
      SELECT TABLE_NAME AS \`table\`, COALESCE(DATA_LENGTH, 0) AS dataBytes,
        COALESCE(INDEX_LENGTH, 0) AS indexBytes, COALESCE(DATA_FREE, 0) AS freeBytes
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (${Prisma.join(TABLES)})
      ORDER BY TABLE_NAME
    `);

    return rows.map((row) => ({
      table: row.table,
      dataBytes: Number(row.dataBytes),
      indexBytes: Number(row.indexBytes),
      freeBytes: Number(row.freeBytes),
    }));
  }

  async optimize(table: string) {
    if (!TABLES.includes(table)) throw invalidInput(Errors.InvalidInput);
    const rows = await this.db.$queryRawUnsafe<
      { Msg_type: string; Msg_text: string }[]
    >(`OPTIMIZE TABLE \`${table}\``);

    if (rows.some((row) => row.Msg_type === 'error'))
      throw invalidInput(Errors.InvalidInput);
  }

  async batch(
    category: CleanupCategory,
    policy: CleanupPolicy,
    actor: Actor,
    limit: number,
  ) {
    if (category === 'expired') return this.deletes.expired(policy.now, limit);

    if (category === 'revisions') {
      const rows = await this.db.$queryRaw<{ id: string; contentId: string }[]>(
        Prisma.sql`${this.revisions(policy.keepLatest)} LIMIT ${limit}`,
      );
      let count = 0;

      for (const row of rows) {
        const guard = await this.db.content.findUnique({
          where: { id: row.contentId },
          select: { updatedAt: true, authorId: true, status: true },
        });

        if (!guard) continue;
        count += await this.db.$transaction(async (tx) => {
          await lockPermalinks(tx);
          checkDeleteGuard(
            await tx.content.findUnique({
              where: { id: row.contentId },
              select: { updatedAt: true, authorId: true, status: true },
            }),
            guard,
          );
          // Re-evaluate retention under the same lock as saves and revision deletion.
          const retained = await tx.contentRevision.findMany({
            where: { contentId: row.contentId, kind: 'revision' },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            skip: policy.keepLatest,
            take: limit,
            select: { id: true },
          });

          if (!retained.some((candidate) => candidate.id === row.id)) return 0;

          return (
            await tx.contentRevision.deleteMany({
              where: { id: row.id, kind: 'revision' },
            })
          ).count;
        });
      }

      return count;
    }

    if (category === 'autosaves')
      return this.db.$transaction(async (tx) => {
        await lockPermalinks(tx);
        const rows = await tx.contentRevision.findMany({
          where: {
            kind: 'autosave',
            createdAt: { lt: policy.autosavesBefore },
          },
          select: { id: true },
          take: limit,
        });

        return (
          await tx.contentRevision.deleteMany({
            where: {
              id: { in: rows.map((row) => row.id) },
              kind: 'autosave',
              createdAt: { lt: policy.autosavesBefore },
            },
          })
        ).count;
      });

    if (category === 'trashedContent') {
      const rows = await this.db.content.findMany({
        where: { trashedAt: { not: null } },
        select: { id: true },
        take: limit,
      });

      for (const row of rows) await this.deletes.content(row.id, actor);

      return rows.length;
    }

    const status = category === 'spamComments' ? 'spam' : 'trash';

    // Comments that left the status after selection are skipped and no longer match, so
    // select again until something is deleted or nothing eligible remains (zero ends the run).
    for (;;) {
      const rows = await this.db.comment.findMany({
        where: { status },
        select: { id: true },
        take: limit,
      });

      if (!rows.length) return 0;
      let deleted = 0;

      for (const row of rows)
        if (await this.deletes.comment(row.id, status, actor)) deleted++;
      if (deleted) return deleted;
    }
  }
}
