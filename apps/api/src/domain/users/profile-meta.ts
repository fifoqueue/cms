import type { ProfileValues } from '@cms/sdk/plugin';
import type { ProfileFields } from '#api/domain/users/profile-fields';

export interface ProfileMetaStore {
  read(userId: string): Promise<ProfileValues>;
  /** Atomic merge under users.lock; refuse deleted or anonymized users. */
  save(userId: string, patch: ProfileValues): Promise<void>;
}

export class ProfileMeta {
  constructor(
    private readonly fields: Pick<
      ProfileFields,
      'list' | 'validate' | 'visible'
    >,
    private readonly store: ProfileMetaStore,
  ) {}
  async get(userId: string) {
    return {
      fields: this.fields.list(),
      values: this.fields.visible(await this.store.read(userId)),
    };
  }
  async save(userId: string, input: unknown) {
    await this.store.save(userId, this.fields.validate(input));
    return this.get(userId);
  }
}
