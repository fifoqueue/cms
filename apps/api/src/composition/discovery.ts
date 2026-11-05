import type { createSecurity } from '#api/composition/security';
import type { HookBus } from '#api/plugin-runtime/hook-bus';
import type { SeoSettingsService } from '#api/domain/seo/seo-settings-service';
import { PublicationPush } from '#api/domain/seo/publication-push';
import { publicationTransport } from '#api/infra/publication-transport';
import type { Logger } from '#api/shared/logger';

export const registerDiscoveryPush = (
  hooks: HookBus,
  seo: SeoSettingsService,
  egressFetch: ReturnType<typeof createSecurity>['egressFetch'],
  logger: Logger,
) => {
  const push = new PublicationPush(
    () => seo.getCore(),
    publicationTransport(egressFetch('webhook')),
    logger,
  );

  push.subscribe(hooks.core('core:discovery'));
};
