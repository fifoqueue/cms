import { profileValuesSchema } from '@cms/sdk/plugin';
import type { ProfileValues } from '@cms/sdk/plugin';
import type { ProfileMetaStore } from '#api/domain/users/profile-meta';
import { lockSetting } from '#api/infra/prisma/client';
import type { Database } from '#api/infra/prisma/client';
import { notFound, Errors } from '#api/shared/errors';

export const profileMetaKey = (userId: string) => `profile-meta.${userId}`;

export class PrismaProfileMeta implements ProfileMetaStore {
  constructor(private readonly db: Database) {}
  async read(userId: string): Promise<ProfileValues> {
    const row = await this.db.setting.findUnique({
      where: { key: profileMetaKey(userId) },
    });
    return row ? profileValuesSchema.parse(JSON.parse(row.value)) : {};
  }
  async save(userId: string, patch: ProfileValues) {
    await this.db.$transaction(async (tx) => {
      await lockSetting(tx, 'users.lock');
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { email: true },
      });
      if (!user || user.email === `erased-${userId}@invalid.invalid`)
        throw notFound(Errors.UserNotFound);
      const key = profileMetaKey(userId);
      const row = await tx.setting.findUnique({ where: { key } });
      const current = row
        ? profileValuesSchema.parse(JSON.parse(row.value))
        : {};
      const value = JSON.stringify({ ...current, ...patch });
      await tx.setting.upsert({
        where: { key },
        create: { key, value },
        update: { value },
      });
    });
  }
}
