import type { ProfileValues } from '@cms/sdk/plugin';
import type { ProfileMetaStore } from '#api/domain/users/profile-meta';
import type { UserRepository } from '#api/domain/auth/ports';
import { notFound, Errors } from '#api/shared/errors';

/** Same missing/anonymized-user and patch semantics as PrismaProfileMeta. */
export class MemoryProfileMeta implements ProfileMetaStore {
  readonly rows = new Map<string, ProfileValues>();
  constructor(private readonly users: Pick<UserRepository, 'findById'>) {}
  async read(userId: string) {
    return structuredClone(this.rows.get(userId) ?? {});
  }
  async save(userId: string, patch: ProfileValues) {
    const user = await this.users.findById(userId);
    if (!user || user.email === `erased-${userId}@invalid.invalid`)
      throw notFound(Errors.UserNotFound);
    this.rows.set(userId, {
      ...this.rows.get(userId),
      ...structuredClone(patch),
    });
  }
}
