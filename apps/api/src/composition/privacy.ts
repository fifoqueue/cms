import type { createRepositories } from '#api/composition/repositories';
import type { EraserRegistry } from '#api/domain/privacy/eraser-registry';
import type { SiteService } from '#api/domain/site/site-service';
import type { SeoSettingsService } from '#api/domain/seo/seo-settings-service';
import { PrivacyService } from '#api/domain/privacy/privacy-service';
import {
  bunPasswordHasher,
  randomTokenIssuer,
  systemClock,
  uuidV7,
} from '#api/infra/system';

export const registerPrivacy = (
  erasers: Pick<EraserRegistry, 'registerCore'>,
  repository: Pick<
    Awaited<ReturnType<typeof createRepositories>>['privacyRepository'],
    'erase'
  >,
) => {
  erasers.registerCore('personal-data', {
    erase: async (request) => {
      await repository.erase(
        request.id,
        await bunPasswordHasher.hash(randomTokenIssuer.issue()),
        systemClock.now(),
      );

      return { erased: 1, retained: 0 };
    },
  });
};

type Input = Pick<
  ConstructorParameters<typeof PrivacyService>[0],
  | 'erasers'
  | 'exporters'
  | 'hooks'
  | 'repository'
  | 'settings'
  | 'published'
  | 'email'
  | 'signer'
  | 'protection'
> & {
  site: Pick<SiteService, 'get'>;
  seo: Pick<SeoSettingsService, 'getPublic'>;
};

export const createPrivacy = ({
  erasers,
  exporters,
  hooks,
  repository,
  settings,
  published,
  email,
  signer,
  protection,
  site,
  seo,
}: Input) =>
  new PrivacyService({
    erasers,
    exporters,
    hooks,
    repository,
    settings,
    published,
    email,
    site: async () => ({
      ...(await site.get()),
      siteUrl: (await seo.getPublic()).siteUrl,
    }),
    signer,
    tokens: randomTokenIssuer,
    hasher: bunPasswordHasher,
    ids: uuidV7,
    clock: systemClock,
    protection,
  });
