import { CaptchaRegistry } from '#api/domain/security/captcha-registry';
import { CORE_CAPTCHA_WIDGETS } from '#api/domain/security/captcha-widgets';
import { httpCaptchaVerifier } from '#api/infra/captcha-verifier';
import type { Logger } from '#api/shared/logger';
import type { Scheduler } from '#api/domain/jobs/scheduler';
import type { AppConfig } from '#api/config';
import type { createRepositories } from '#api/composition/repositories';
import { createEgress } from '#api/composition/persistence';
import type { createSecrets } from '#api/composition/persistence';
import { AvatarService } from '#api/domain/comments/avatar-service';
import { SecuritySettingsService } from '#api/domain/security/security-settings';
import { ProtectionService } from '#api/domain/security/protection-service';
import { SearchService } from '#api/domain/search/search-service';
import { GravatarSource } from '#api/infra/gravatar-source';
import { createMeilisearchEngine } from '#api/infra/meilisearch-engine';
import { systemClock } from '#api/infra/system';
import { createSearchProviders } from '#api/plugin-runtime/discovery-providers';

export const createCaptcha = (
  timeoutMs: number,
  logger: Logger,
): { captchaProviders: CaptchaRegistry } => {
  const captchaProviders = new CaptchaRegistry({ timeoutMs, logger });
  const coreCaptcha = httpCaptchaVerifier(logger);
  for (const id of ['turnstile', 'hcaptcha', 'recaptcha'])
    captchaProviders.registerCore(id, {
      label: id,
      widget: CORE_CAPTCHA_WIDGETS[id],
      verify: (input) => coreCaptcha.verify(input),
    });
  return { captchaProviders };
};

type Input = Pick<
  Awaited<ReturnType<typeof createRepositories>>,
  'avatarDirectory' | 'settingsRepository' | 'rateLimits' | 'searchSource'
> &
  ReturnType<typeof createSecrets> & {
    hooks: ConstructorParameters<typeof SecuritySettingsService>[2];
    captchaProviders: CaptchaRegistry;
    allowlist: AppConfig['CMS_EGRESS_ALLOWLIST'];
    timeoutMs: number;
    logger: Logger;
  };

export const createSecurity = ({
  avatarDirectory,
  settingsRepository,
  rateLimits,
  searchSource,
  signer,
  secrets,
  hooks,
  captchaProviders,
  allowlist,
  timeoutMs,
  logger,
}: Input) => {
  const avatars = new AvatarService(
    avatarDirectory,
    new GravatarSource(),
    signer,
  );
  const security = new SecuritySettingsService(
    settingsRepository,
    secrets,
    hooks,
    () => captchaProviders.list(),
    (id) => captchaProviders.widget(id),
  );
  const { egress, access, egressFetch, checkUrl } = createEgress(
    settingsRepository,
    allowlist,
    hooks,
  );
  const meilisearchEngine = createMeilisearchEngine(egressFetch('search'));
  const protection = new ProtectionService({
    hooks,
    signer,
    settings: security,
    store: rateLimits,
    captcha: captchaProviders,
    clock: systemClock,
  });
  const search = new SearchService({
    hooks,
    settings: settingsRepository,
    secrets,
    engine: meilisearchEngine,
    source: searchSource,
    clock: systemClock,
    logger,
    checkDestination: (url) => checkUrl('search', url),
  });
  const { registry: searchEngines, lookup: searchLookup } =
    createSearchProviders(search, { timeoutMs, logger });
  return {
    avatars,
    mediaLimits: async () => (await security.policy()).media,
    schedule: (scheduler: Pick<Scheduler, 'add'>) =>
      scheduler.add({
        name: 'search.sync',
        intervalMs: 5_000,
        run: () => search.sync(),
      }),
    security,
    egress,
    access,
    egressFetch,
    checkUrl,
    protection,
    search,
    searchEngines,
    searchLookup,
  };
};
