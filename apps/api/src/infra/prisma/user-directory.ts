import type {
  UserChanges,
  UserDirectory,
} from '#api/domain/users/user-directory';
import { guardUnique, lockSetting } from '#api/infra/prisma/client';
import type { Database } from '#api/infra/prisma/client';
import type { Prisma } from '#api/infra/prisma/generated/client';
import {
  lockPermalinks,
  refreshContentPaths,
} from '#api/infra/prisma/permalink-repository';
import { PUBLIC_CONTENT } from '#api/infra/prisma/content-criteria';
import { conflict, Errors } from '#api/shared/errors';

/** Row in `settings` whose lock serializes role changes and deletions. */
const LOCK_KEY = 'users.lock';

const columns = {
  id: true,
  email: true,
  name: true,
  role: true,
  slug: true,
  bio: true,
  locale: true,
  createdAt: true,
  _count: { select: { contents: true } },
} as const satisfies Prisma.UserSelect;

type Row = Prisma.UserGetPayload<{ select: typeof columns }>;

const toItem = ({ _count, ...user }: Row) => ({
  ...user,
  contentCount: _count.contents,
});

/** Throws `conflict` unless an administrator other than `id` remains. */
const assertOtherAdministrator = async (
  tx: Prisma.TransactionClient,
  id: string,
) => {
  const others = await tx.user.count({
    where: { role: 'administrator', id: { not: id } },
  });
  if (others === 0) throw conflict(Errors.LastAdministrator);
};

export class PrismaUserDirectory implements UserDirectory {
  constructor(private readonly db: Database) {}

  async list() {
    const rows = await this.db.user.findMany({
      select: columns,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return rows.map(toItem);
  }

  async get(id: string) {
    const row = await this.db.user.findUnique({
      where: { id },
      select: columns,
    });
    return row && toItem(row);
  }

  async publicAuthor(slug: string) {
    return this.db.user.findFirst({
      // Users without public entries are not listed, so archives never enumerate accounts.
      where: { slug, contents: { some: PUBLIC_CONTENT } },
      select: { name: true, slug: true, bio: true },
    });
  }

  async update({ id, ...changes }: UserChanges) {
    await guardUnique(
      () =>
        this.db.$transaction(async (tx) => {
          await lockPermalinks(tx);
          await lockSetting(tx, LOCK_KEY);
          if (changes.role !== 'administrator')
            await assertOtherAdministrator(tx, id);
          await tx.user.update({ where: { id }, data: changes });
          await refreshContentPaths(tx, { authorId: id });
        }),
      Errors.EmailRegistered,
    );
  }

  async delete(id: string, reassignTo: string | null) {
    await this.db.$transaction(async (tx) => {
      await lockPermalinks(tx);
      await lockSetting(tx, LOCK_KEY);
      await assertOtherAdministrator(tx, id);
      if (reassignTo)
        await tx.content.updateMany({
          where: { authorId: id },
          data: { authorId: reassignTo },
        });
      // Paths, assignments, sessions and sign-in links go with their rows (ON DELETE CASCADE).
      else {
        await tx.content.deleteMany({ where: { authorId: id } });
        await tx.searchOutbox.create({ data: { contentId: null } });
      }
      await tx.user.delete({ where: { id } });
      await refreshContentPaths(tx);
    });
  }
}
