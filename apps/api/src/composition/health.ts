import type { SiteHealthService as Health } from '#api/domain/tools/site-health';
import { SiteHealthService } from '#api/domain/tools/site-health';
import type { SeoSettingsService } from '#api/domain/seo/seo-settings-service';
import type { EmailService } from '#api/domain/email/email-service';
import type { SearchService } from '#api/domain/search/search-service';
import type { Scheduler } from '#api/domain/jobs/scheduler';
import { systemClock } from '#api/infra/system';

type Input = Pick<
  ConstructorParameters<typeof Health>[0],
  'checks' | 'leases' | 'jobs' | 'plugins' | 'visitorProof'
> & {
  seo: Pick<SeoSettingsService, 'getPublic'>;
  email: Pick<EmailService, 'enabled'>;
  search: Pick<SearchService, 'status'>;
  scheduler: Pick<Scheduler, 'names'>;
  version: string;
  database: ConstructorParameters<typeof Health>[0]['info']['database'];
};

export const createHealth = ({
  checks,
  leases,
  jobs,
  plugins,
  visitorProof,
  seo,
  email,
  search,
  scheduler,
  version,
  database,
}: Input) =>
  new SiteHealthService({
    checks,
    siteUrl: async () => (await seo.getPublic()).siteUrl,
    emailEnabled: () => email.enabled(),
    search: () => search.status(),
    leases,
    recurring: () => scheduler.names(),
    jobs,
    plugins,
    visitorProof,
    info: { cms: version, runtime: `Bun ${Bun.version}`, database },
    clock: systemClock,
  });
