import type { OidcSessionBinding } from '#api/domain/auth/sso-ports';
import type { SsoSetup } from '#api/domain/auth/sso-service';
import { sameIssuer } from '#api/domain/auth/sso-issuer';
import type { SecretBox } from '#api/domain/ports';
import type { Logger } from '#api/shared/logger';

/** Optional provider navigation after local session deletion; never rejects or logs credentials. */
export class SsoEndSession {
  constructor(
    private readonly deps: {
      setup(): Promise<SsoSetup>;
      secrets: SecretBox;
      logger: Logger;
    },
  ) {}

  async url(binding: OidcSessionBinding): Promise<string | null> {
    if (!binding.logout) return null;

    try {
      const provider = (await this.deps.setup()).providers.find(
        (entry) =>
          entry.id === binding.logout!.providerId &&
          sameIssuer(entry.issuer, binding.issuer),
      );

      if (!provider) return null;
      const hint = this.deps.secrets.open(binding.logout.sealedIdToken);

      if (hint === null)
        this.deps.logger.warn(
          'Single sign-on logout ID token could not be unsealed',
        );

      return await provider.provider.endSession(
        binding.logout.clientId,
        hint ?? undefined,
      );
    } catch {
      this.deps.logger.warn('Single sign-on end-session URL unavailable');

      return null;
    }
  }
}
