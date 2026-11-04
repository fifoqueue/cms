import type { AppConfig } from '#api/config';
import type { createSecrets } from '#api/composition/persistence';
import { createApiApp } from '#api/http/app';
import { ClientResolver } from '#api/http/client-identity';
import { SeoFilterGateway } from '#api/http/seo-filter-gateway';
import { PluginGateway } from '#api/http/plugin-gateway';
import { SlotService } from '#api/plugin-runtime/slot-service';
import { MemoryRateLimiter } from '#api/infra/memory-rate-limiter';
import { systemClock } from '#api/infra/system';
import type { Logger } from '#api/shared/logger';

type Services = Omit<
  Parameters<typeof createApiApp>[0]['services'],
  'clients' | 'frontendSecret' | 'seoFilter' | 'slots' | 'pluginGateway'
>;

export const createHttp = ({
  config,
  signer,
  logger,
  timeoutMs,
  slots,
  routes,
}: {
  config: Pick<AppConfig, 'CMS_FRONTEND_SECRET' | 'OIDC_FRONTEND_SECRET'>;
  signer: Pick<ReturnType<typeof createSecrets>['signer'], 'sign'>;
  logger: Logger;
  timeoutMs: number;
  slots: ConstructorParameters<typeof SlotService>[0];
  routes: ConstructorParameters<typeof PluginGateway>[0]['routes'];
}) => {
  // Unconfigured, it is derived from the signing key, so every instance has the same one.
  const frontendSecret =
    config.CMS_FRONTEND_SECRET ??
    config.OIDC_FRONTEND_SECRET ??
    signer.sign('frontend-secret');
  const clients = new ClientResolver(frontendSecret);
  const assemble = (services: Services) =>
    createApiApp({
      logger,
      services: {
        ...services,
        clients,
        frontendSecret,
        seoFilter: new SeoFilterGateway(
          clients,
          new MemoryRateLimiter({
            clock: systemClock,
            perKey: 6000,
            total: 60000,
            windowMs: 60_000,
          }),
          services.seo,
        ),
        slots: new SlotService(slots),
        pluginGateway: new PluginGateway({
          auth: services.auth,
          routes,
          timeoutMs,
          logger,
        }),
      },
    });

  return { clients, assemble, visitorProof: () => clients.proven };
};
