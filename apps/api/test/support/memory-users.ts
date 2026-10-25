import { ROLES } from '@cms/sdk';
import type { RoleDefinition, UserQuery } from '@cms/sdk';
import type { UserRecord } from '#api/domain/auth/ports';
import type { SettingsRepository } from '#api/domain/site/site-service';
import type {
  RoleWriter,
  UserChanges,
  UserDirectory,
  UserProfileChanges,
} from '#api/domain/users/user-directory';
import { conflict, invalidInput, notFound, Errors } from '#api/shared/errors';
import type { MemoryContentRepository } from '#test/support/memory';
import { writeQueue } from '#test/support/memory-rows';
import type { MemoryUsers } from '#test/support/sso-memory';

/** Same contract as `PrismaUserDirectory`, over the in-memory user and content tables. */
export class MemoryUserDirectory implements UserDirectory, RoleWriter {
  private readonly roles = new Set<string>(ROLES);
  private readonly deletedRoles = new Set<string>();

  constructor(
    private readonly users: MemoryUsers,
    private readonly content: MemoryContentRepository,
    private readonly settings?: SettingsRepository,
    private readonly contributed: (key: string) => boolean = () => false,
  ) {}

  async list(query: UserQuery = {}) {
    return [...this.users.rows.values()]
      .filter((user) => !query.role || user.role === query.role)
      .filter(
        (user) =>
          !query.search ||
          [user.name, user.email, user.slug].some((value) =>
            value.toLowerCase().includes(query.search!.toLowerCase()),
          ),
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map(({ passwordHash: _passwordHash, ...user }) => ({
        ...user,
        contentCount: [...this.content.rows.values()].filter(
          (row) => row.authorId === user.id,
        ).length,
      }));
  }

  async get(id: string) {
    return (await this.list()).find((user) => user.id === id) ?? null;
  }

  async publicAuthor(slug: string) {
    const user = [...this.users.rows.values()].find((row) => row.slug === slug);
    const hasPublic = [...this.content.rows.values()].some(
      (row) =>
        row.authorId === user?.id &&
        row.status === 'published' &&
        !this.content.trashed.has(row.id),
    );
    return user && hasPublic
      ? { name: user.name, slug: user.slug, bio: user.bio }
      : null;
  }

  /** User writes run one at a time, like the Prisma adapter's `users.lock`. */
  private readonly exclusive = writeQueue();

  insert(user: UserRecord) {
    return this.exclusive(async () => {
      this.requireRole(user.role);
      await this.users.insert(user);
    });
  }

  update(changes: UserChanges) {
    return this.exclusive(async () => {
      this.requireRole(changes.role);
      const current = this.users.rows.get(changes.id)!;
      if (changes.role !== 'administrator')
        this.assertOtherAdministrator(changes.id);
      this.users.rows.set(changes.id, { ...current, ...changes });
    });
  }

  updateProfile(changes: UserProfileChanges) {
    return this.exclusive(async () => {
      const current = this.users.rows.get(changes.id)!;
      this.users.rows.set(changes.id, { ...current, ...changes });
    });
  }

  setRole(id: string, role: string) {
    return this.exclusive(async () => {
      this.requireRole(role);
      const current = this.users.rows.get(id)!;
      if (role !== 'administrator') this.assertOtherAdministrator(id);
      this.users.rows.set(id, { ...current, role });
    });
  }

  saveRole(role: RoleDefinition) {
    return this.exclusive(async () => {
      this.roles.add(role.key);
      this.deletedRoles.delete(role.key);
      await this.settings?.set(`role.${role.key}`, role);
    });
  }

  removeRole(key: string, reassignTo: string) {
    return this.exclusive(async () => {
      if (!this.hasRole(key)) throw notFound(Errors.RoleUnknown);
      if (key === reassignTo || !this.hasRole(reassignTo))
        throw invalidInput(Errors.RoleUnknown, [
          { path: 'reassignTo', message: Errors.RoleUnknown },
        ]);
      for (const user of this.users.rows.values())
        if (user.role === key) user.role = reassignTo;
      this.roles.delete(key);
      this.deletedRoles.add(key);
      await this.settings?.set(`role.${key}`, null);
    });
  }

  delete(id: string, reassignTo: string | null) {
    return this.content.transaction(() =>
      this.exclusive(async () => {
        this.assertOtherAdministrator(id);
        for (const row of [...this.content.rows.values()])
          if (row.authorId === id) {
            if (reassignTo) row.authorId = reassignTo;
            else await this.content.erase(row.id);
          }
        for (const revision of this.content.revisions.rows)
          if (revision.authorId === id) {
            revision.authorId = null;
            revision.authorName = '';
          }
        this.users.rows.delete(id);
      }),
    );
  }

  private assertOtherAdministrator(id: string) {
    const others = [...this.users.rows.values()].filter(
      (user) => user.role === 'administrator' && user.id !== id,
    );
    if (others.length === 0) throw conflict(Errors.LastAdministrator);
  }

  private requireRole(role: string) {
    if (!this.hasRole(role)) throw invalidInput(Errors.RoleUnknown);
  }
  private hasRole(role: string) {
    return (
      !this.deletedRoles.has(role) &&
      (this.roles.has(role) || this.contributed(role))
    );
  }
}
