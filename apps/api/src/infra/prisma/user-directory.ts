import { ROLES, roleDefinitionSchema } from '@cms/sdk';
import type { RoleDefinition } from '@cms/sdk';
import type { UserRecord } from '#api/domain/auth/ports';
import type {
  RoleWriter,
  UserChanges,
  UserDirectory,
  UserProfileChanges,
} from '#api/domain/users/user-directory';
import { guardUnique, lockSetting } from '#api/infra/prisma/client';
import type { Database } from '#api/infra/prisma/client';
import type { Prisma } from '#api/infra/prisma/generated/client';
import {
  lockPermalinks,
  refreshContentPaths,
} from '#api/infra/prisma/permalink-repository';
import { PUBLIC_CONTENT } from '#api/infra/prisma/content-criteria';
import { conflict, invalidInput, notFound, Errors } from '#api/shared/errors';

/** Row in `settings` whose lock serializes role changes and deletions. */
const LOCK_KEY = 'users.lock';
const ROLE_PREFIX = 'role.';

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

const hasRole = async (tx: Prisma.TransactionClient, key: string) => {
  if ((ROLES as readonly string[]).includes(key)) return true;
  const row = await tx.setting.findUnique({
    where: { key: `${ROLE_PREFIX}${key}` },
  });
  if (!row) return false;
  try {
    const role = roleDefinitionSchema.safeParse(JSON.parse(row.value));
    return role.success && role.data.key === key;
  } catch {
    return false;
  }
};

const requireRole = async (tx: Prisma.TransactionClient, key: string) => {
  if (!(await hasRole(tx, key))) throw invalidInput(Errors.RoleUnknown);
};

export class PrismaUserDirectory implements UserDirectory, RoleWriter {
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

  async insert(user: UserRecord) {
    await guardUnique(
      () =>
        this.db.$transaction(async (tx) => {
          await lockSetting(tx, LOCK_KEY);
          await requireRole(tx, user.role);
          await tx.user.create({ data: user });
        }),
      Errors.EmailRegistered,
    );
  }

  async update({ id, ...changes }: UserChanges) {
    await guardUnique(
      () =>
        this.db.$transaction(async (tx) => {
          await lockPermalinks(tx);
          await lockSetting(tx, LOCK_KEY);
          await requireRole(tx, changes.role);
          if (changes.role !== 'administrator')
            await assertOtherAdministrator(tx, id);
          await tx.user.update({ where: { id }, data: changes });
          await refreshContentPaths(tx, { authorId: id });
        }),
      Errors.EmailRegistered,
    );
  }

  async updateProfile({ id, ...changes }: UserProfileChanges) {
    await guardUnique(
      () =>
        this.db.$transaction(async (tx) => {
          await lockPermalinks(tx);
          await lockSetting(tx, LOCK_KEY);
          await tx.user.update({ where: { id }, data: changes });
          await refreshContentPaths(tx, { authorId: id });
        }),
      Errors.EmailRegistered,
    );
  }

  async setRole(id: string, role: string) {
    await this.db.$transaction(async (tx) => {
      await lockSetting(tx, LOCK_KEY);
      await requireRole(tx, role);
      if (role !== 'administrator') await assertOtherAdministrator(tx, id);
      await tx.user.update({ where: { id }, data: { role } });
    });
  }

  async saveRole(role: RoleDefinition) {
    await this.db.$transaction(async (tx) => {
      await lockSetting(tx, LOCK_KEY);
      await tx.setting.upsert({
        where: { key: `${ROLE_PREFIX}${role.key}` },
        create: {
          key: `${ROLE_PREFIX}${role.key}`,
          value: JSON.stringify(role),
        },
        update: { value: JSON.stringify(role) },
      });
    });
  }

  async removeRole(key: string, reassignTo: string) {
    await this.db.$transaction(async (tx) => {
      await lockSetting(tx, LOCK_KEY);
      if (!(await hasRole(tx, key))) throw notFound(Errors.RoleUnknown);
      if (reassignTo === key || !(await hasRole(tx, reassignTo)))
        throw invalidInput(Errors.RoleUnknown, [
          { path: 'reassignTo', message: Errors.RoleUnknown },
        ]);
      await tx.user.updateMany({
        where: { role: key },
        data: { role: reassignTo },
      });
      await tx.setting.upsert({
        where: { key: `${ROLE_PREFIX}${key}` },
        create: { key: `${ROLE_PREFIX}${key}`, value: 'null' },
        update: { value: 'null' },
      });
    });
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
