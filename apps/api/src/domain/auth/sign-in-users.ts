import type { Capability, UserProfile } from '@cms/sdk';
import type { UserDirectory } from '@cms/sdk/plugin';
import type { UserRecord, UserRepository } from '#api/domain/auth/ports';
import { toProfile } from '#api/domain/users/user-mapper';

/** Lookups do not verify identity: per-user capability grants must wait for session issuance. */
export const createSignInUsers = (
  users: UserRepository,
  roles: { capabilities(role: string): Promise<Capability[]> },
): UserDirectory => {
  const profile = async (
    user: UserRecord | null,
  ): Promise<UserProfile | null> => {
    if (!user) return null;
    return {
      ...toProfile(user),
      capabilities: await roles.capabilities(user.role),
    };
  };
  return {
    findById: async (id) => profile(await users.findById(id)),
    findByEmail: async (email) => profile(await users.findByEmail(email)),
  };
};
