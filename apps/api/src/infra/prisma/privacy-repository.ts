import type { PrivacyAction } from '@cms/sdk';
import { profileValuesSchema } from '@cms/sdk/plugin';
import { profileMetaKey } from '#api/infra/prisma/profile-meta';
import type {
  PersonalSection,
  PrivacyRecord,
  PrivacyRepository,
} from '#api/domain/privacy/ports';
import type { SecretBox } from '#api/domain/ports';
import type { Database } from '#api/infra/prisma/client';
import { lockSetting } from '#api/infra/prisma/client';
import { Prisma } from '#api/infra/prisma/generated/client';
import { openJob } from '#api/domain/jobs/payload';
import {
  lockPermalinks,
  queueContentPaths,
} from '#api/infra/prisma/permalink-repository';
import type { PermalinkTokenRegistry } from '#api/domain/permalinks/token-registry';
import { conflict, invalidInput, Errors } from '#api/shared/errors';

const dates = (row: object): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key,
      value instanceof Date ? value.toISOString() : value,
    ]),
  );

export class PrismaPrivacyRepository implements PrivacyRepository {
  constructor(
    private readonly db: Database,
    private readonly secrets: SecretBox,
    private readonly kick: () => void = () => {},
    private readonly tokens?: PermalinkTokenRegistry,
  ) {}
  async insert(request: PrivacyRecord) {
    await this.db.privacyRequest.create({ data: request });
  }
  async get(id: string) {
    return (await this.db.privacyRequest.findUnique({
      where: { id },
    })) as PrivacyRecord | null;
  }
  async list(action: PrivacyAction, page: number) {
    const where = { action };
    const [items, total] = await this.db.$transaction([
      this.db.privacyRequest.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 20,
        skip: (page - 1) * 20,
      }),
      this.db.privacyRequest.count({ where }),
    ]);
    return { items: items as PrivacyRecord[], total };
  }
  async confirm(id: string, tokenHash: string, now: Date) {
    const { count } = await this.db.privacyRequest.updateMany({
      where: { id, tokenHash, status: 'pending', expiresAt: { gt: now } },
      data: { status: 'confirmed', confirmedAt: now, tokenHash: null },
    });
    return count === 1;
  }
  async complete(id: string, now: Date) {
    await this.db.privacyRequest.updateMany({
      where: { id, status: 'confirmed' },
      data: { status: 'completed', completedAt: now },
    });
  }
  async data(
    email: string,
    section: PersonalSection,
    after: string | null,
    limit: number,
  ) {
    const user = await this.db.user.findUnique({
      where: { email },
      select: { id: true },
    });
    const page = { take: limit, orderBy: { id: 'asc' as const } };
    const id = after ? { gt: after } : undefined;
    if (section === 'profileFields') {
      if (!user || after) return [];
      const row = await this.db.setting.findUnique({
        where: { key: profileMetaKey(user.id) },
      });
      return row
        ? [
            {
              id: user.id,
              values: profileValuesSchema.parse(JSON.parse(row.value)),
            },
          ]
        : [];
    }
    if (section === 'profile') {
      if (!user || after) return [];
      const row = await this.db.user.findUnique({
        where: { id: user.id },
        select: {
          id: true,
          email: true,
          name: true,
          slug: true,
          bio: true,
          locale: true,
          role: true,
          createdAt: true,
        },
      });
      return row ? [dates(row)] : [];
    }
    if (section === 'comments')
      return (
        await this.db.comment.findMany({
          ...page,
          where: {
            id,
            OR: [
              { authorEmail: email },
              ...(user ? [{ userId: user.id }] : []),
            ],
          },
          select: {
            id: true,
            contentId: true,
            parentId: true,
            authorName: true,
            authorEmail: true,
            authorUrl: true,
            body: true,
            status: true,
            createdAt: true,
            updatedAt: true,
          },
        })
      ).map(dates);
    if (!user) return [];
    if (section === 'passkeys')
      return (
        await this.db.passkey.findMany({
          ...page,
          where: { id, userId: user.id },
          select: { id: true, name: true, createdAt: true },
        })
      ).map((row) => ({
        id: row.id,
        factor: 'passkey',
        label: row.name,
        createdAt: row.createdAt.toISOString(),
      }));
    if (section === 'totp')
      return (
        await this.db.totpSecret.findMany({
          ...page,
          where: { id, userId: user.id },
          select: { id: true, createdAt: true },
        })
      ).map((row) => ({
        id: row.id,
        factor: 'totp',
        label: 'Authenticator app',
        createdAt: row.createdAt.toISOString(),
      }));
    if (section === 'recoveryCodes')
      return (
        await this.db.recoveryCode.findMany({
          ...page,
          where: { id, userId: user.id },
          select: { id: true, createdAt: true },
        })
      ).map((row) => ({
        id: row.id,
        factor: 'recovery-code',
        label: 'Recovery code',
        createdAt: row.createdAt.toISOString(),
      }));
    if (section === 'apiTokens')
      return (
        await this.db.apiToken.findMany({
          ...page,
          where: { id, userId: user.id },
          select: {
            id: true,
            name: true,
            createdAt: true,
            lastUsedAt: true,
            expiresAt: true,
          },
        })
      ).map(dates);
    if (section === 'identities')
      return (
        await this.db.userIdentity.findMany({
          ...page,
          where: { id, userId: user.id },
          select: { id: true, issuer: true, subject: true, createdAt: true },
        })
      ).map((row) => ({
        id: row.id,
        issuer: new TextDecoder().decode(row.issuer),
        subject: new TextDecoder().decode(row.subject),
        createdAt: row.createdAt.toISOString(),
      }));
    if (section === 'content')
      return (
        await this.db.content.findMany({
          ...page,
          where: { id, authorId: user.id },
          select: {
            id: true,
            title: true,
            slug: true,
            type: true,
            status: true,
            html: true,
            excerpt: true,
            createdAt: true,
            publishedAt: true,
            updatedAt: true,
          },
        })
      ).map(dates);
    return (
      await this.db.media.findMany({
        ...page,
        where: { id, uploaderId: user.id },
        select: {
          id: true,
          filename: true,
          title: true,
          description: true,
          alt: true,
          caption: true,
          mime: true,
          createdAt: true,
        },
      })
    ).map(dates);
  }
  async erase(id: string, passwordHash: string, now: Date) {
    await this.db.$transaction(
      async (tx) => {
        await lockPermalinks(tx);
        await lockSetting(tx, 'users.lock');
        await tx.$queryRaw`SELECT id FROM privacy_requests WHERE id = ${id} FOR UPDATE`;
        const request = await tx.privacyRequest.findUnique({ where: { id } });
        if (
          !request ||
          request.action !== 'erase' ||
          request.status !== 'confirmed'
        )
          throw invalidInput(Errors.PrivacyNotConfirmed);
        const user = await tx.user.findUnique({
          where: { email: request.email },
          select: { id: true, role: true },
        });
        if (
          user?.role === 'administrator' &&
          (await tx.user.count({
            where: { role: 'administrator', id: { not: user.id } },
          })) === 0
        )
          throw conflict(Errors.LastAdministrator);
        await lockSetting(tx, 'privacy.jobs');
        const where = {
          OR: [
            { authorEmail: request.email },
            ...(user ? [{ userId: user.id }] : []),
          ],
        };
        const comments = await tx.comment.findMany({
          where,
          select: { id: true },
        });
        const needles = [
          request.email.toLowerCase(),
          ...(user ? [user.id] : []),
          ...comments.map((row) => row.id),
        ];
        let after = '';
        for (;;) {
          const jobs = await tx.$queryRaw<
            {
              id: string;
              kind: string;
              payload: string;
              lastError: string | null;
              lockedUntil: Date | null;
            }[]
          >(
            Prisma.sql`SELECT id, kind, payload, last_error AS lastError, locked_until AS lockedUntil FROM jobs WHERE id > ${after} ORDER BY id LIMIT 200 FOR UPDATE`,
          );
          for (const job of jobs) {
            let raw: unknown;
            try {
              raw = JSON.parse(job.payload);
            } catch {
              throw conflict(Errors.PrivacyJobsUnreadable);
            }
            const opened = openJob(raw, this.secrets);
            if (
              opened === null &&
              raw &&
              typeof raw === 'object' &&
              'sealed' in raw
            )
              throw conflict(Errors.PrivacyJobsUnreadable);
            const serialized =
              `${JSON.stringify(opened)} ${job.lastError ?? ''}`.toLowerCase();
            if (!needles.some((needle) => serialized.includes(needle))) {
              const message = opened as {
                subject?: unknown;
                subjects?: unknown;
              } | null;
              // Legacy author notices could omit both the email and comment link; ownership cannot be inferred safely.
              if (
                job.kind === 'email.send' &&
                typeof message?.subject === 'string' &&
                /\] (New comment:|새 댓글:)/.test(message.subject) &&
                (!Array.isArray(message.subjects) ||
                  message.subjects.length === 0)
              )
                throw conflict(Errors.PrivacyJobsUnscoped);
              continue;
            }
            if (job.lockedUntil && job.lockedUntil > now)
              throw conflict(Errors.PrivacyJobsBusy);
            // Delete the snapshot, including failed jobs and any recipient/error metadata.
            await tx.job.delete({ where: { id: job.id } });
          }
          if (jobs.length < 200) break;
          after = jobs.at(-1)!.id;
        }
        await tx.comment.updateMany({
          where,
          data: {
            authorName: 'Anonymous',
            authorEmail: '',
            authorUrl: '',
            body: '',
            userId: null,
            updatedAt: now,
          },
        });
        if (user) {
          await tx.setting.deleteMany({
            where: { key: profileMetaKey(user.id) },
          });
          await tx.session.deleteMany({ where: { userId: user.id } });
          await tx.passwordToken.deleteMany({ where: { userId: user.id } });
          await tx.recoveryCode.deleteMany({ where: { userId: user.id } });
          await tx.passkey.deleteMany({ where: { userId: user.id } });
          await tx.totpSecret.deleteMany({ where: { userId: user.id } });
          await tx.signInTransaction.deleteMany({ where: { userId: user.id } });
          await tx.apiToken.deleteMany({ where: { userId: user.id } });
          await tx.ssoTransaction.deleteMany({ where: { userId: user.id } });
          await tx.userIdentity.deleteMany({ where: { userId: user.id } });
          await tx.contentRevision.updateMany({
            where: { authorId: user.id },
            data: { authorId: null },
          });
          await tx.media.updateMany({
            where: { uploaderId: user.id },
            data: {
              uploaderId: null,
              filename: 'file',
              title: '',
              description: '',
              alt: '',
              caption: '',
            },
          });
          await tx.user.update({
            where: { id: user.id },
            data: {
              email: `erased-${user.id}@invalid.invalid`,
              name: 'Anonymous',
              slug: `erased-${user.id}`,
              bio: '',
              locale: '',
              passwordHash,
              role: 'subscriber',
            },
          });
          await queueContentPaths(tx, { authorId: user.id }, this.tokens);
          await tx.searchOutbox.create({ data: { contentId: null } });
        }
        await tx.privacyRequest.updateMany({
          where: { email: request.email },
          data: {
            email: `erased-${id}@invalid.invalid`,
            tokenHash: null,
            status: 'completed',
            completedAt: now,
          },
        });
      },
      { timeout: 60000 },
    );
    this.kick();
  }
}
