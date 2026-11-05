import { backchannelLogoutSchema } from '@cms/sdk';
import type { SsoSetup } from '#api/domain/auth/sso-service';
import type { UserRepository } from '#api/domain/auth/ports';
import type { HookDispatcher } from '#api/domain/ports';
import type { SsoLogoutSessions } from '#api/domain/auth/sso-logout-ports';
import { LOGOUT_CLOCK_TOLERANCE } from '#api/domain/auth/sso-logout-ports';
import { toProfile } from '#api/domain/users/user-mapper';
import { parseInput } from '#api/shared/validation';
import { Errors, invalidInput } from '#api/shared/errors';

export class SsoLogoutService {
  constructor(
    private readonly deps: {
      setup(): Promise<SsoSetup>;
      sessions: SsoLogoutSessions;
      users: Pick<UserRepository, 'findById'>;
      hooks: HookDispatcher;
    },
  ) {}

  async logout(input: unknown): Promise<string[]> {
    const { logoutToken } = parseInput(backchannelLogoutSchema, input);

    for (const { provider } of (await this.deps.setup()).providers) {
      const logout = await provider.verifyLogout(logoutToken);

      if (!logout) continue;
      const cutoff = new Date(
        (logout.issuedAt + LOGOUT_CLOCK_TOLERANCE) * 1000,
      );
      const userIds = await this.deps.sessions.deleteMatching(logout, cutoff);

      if (this.deps.hooks.has('user.signedOut'))
        for (const userId of userIds) {
          const user = await this.deps.users.findById(userId);

          if (user)
            await this.deps.hooks.emit('user.signedOut', {
              user: toProfile(user),
              scope: 'provider',
              actorId: userId,
            });
        }

      return userIds;
    }

    throw invalidInput(Errors.SsoLogoutInvalid);
  }
}
