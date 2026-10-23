import { ROLES } from '@cms/sdk';
import type { RoleDefinition } from '@cms/sdk';
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
import type { MemoryUsers } from '#test/support/sso-memory';

/** Same contract as `PrismaUserDirectory`, over the in-memory user and content tables. */
export class MemoryUserDirectory implements UserDirectory, RoleWriter {
  private readonly roles = new Set<string>(ROLES);

  constructor(
    private readonly users: MemoryUsers,
    private readonly content: MemoryContentRepository,
    private readonly settings?: SettingsRepository,
  ) {}

  async list() {
    return [...this.users.rows.values()]
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

  /** User writes run one at a time, like the Prisma adapter's `users.lock` (taken before content). */
  private writing: Promise<unknown> = Promise.resolve();
  private exclusive<T>(task: () => Promise<T>): Promise<T> {
    const run = this.writing.then(task, task);
    this.writing = run.catch(() => undefined);
    return run;
  }

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
      await this.settings?.set(`role.${role.key}`, role);
    });
  }

  removeRole(key: string, reassignTo: string) {
    return this.exclusive(async () => {
      if (!this.roles.has(key)) throw notFound(Errors.RoleUnknown);
      if (key === reassignTo || !this.roles.has(reassignTo))
        throw invalidInput(Errors.RoleUnknown, [
          { path: 'reassignTo', message: Errors.RoleUnknown },
        ]);
      for (const user of this.users.rows.values())
        if (user.role === key) user.role = reassignTo;
      this.roles.delete(key);
      await this.settings?.set(`role.${key}`, null);
    });
  }

  delete(id: string, reassignTo: string | null) {
    return this.exclusive(async () => {
      this.assertOtherAdministrator(id);
      for (const row of [...this.content.rows.values()])
        if (row.authorId === id) {
          if (reassignTo) row.authorId = reassignTo;
          else await this.content.delete(row.id);
        }
      this.users.rows.delete(id);
    });
  }

  private assertOtherAdministrator(id: string) {
    const others = [...this.users.rows.values()].filter(
      (user) => user.role === 'administrator' && user.id !== id,
    );
    if (others.length === 0) throw conflict(Errors.LastAdministrator);
  }

  private requireRole(role: string) {
    if (!this.roles.has(role)) throw invalidInput(Errors.RoleUnknown);
  }
}
