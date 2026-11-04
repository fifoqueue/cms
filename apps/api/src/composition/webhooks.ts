import type { createSecurity } from '#api/composition/security';
import type { HookBus } from '#api/plugin-runtime/hook-bus';
import type { JobRunner } from '#api/domain/jobs/job-runner';
import {
  WEBHOOK_JOB,
  WebhookService,
} from '#api/domain/webhooks/webhook-service';
import { createHttpWebhookTransport } from '#api/infra/webhook-transport';
import { randomTokenIssuer, systemClock, uuidV7 } from '#api/infra/system';

type Input = Pick<
  ConstructorParameters<typeof WebhookService>[0],
  'settings' | 'secrets' | 'sealedJobs' | 'logger'
> &
  Pick<ReturnType<typeof createSecurity>, 'egressFetch' | 'checkUrl'> & {
    hooks: HookBus;
    jobs: Pick<JobRunner, 'handle'>;
  };

export const createWebhooks = ({
  hooks,
  settings,
  secrets,
  sealedJobs,
  logger,
  egressFetch,
  checkUrl,
  jobs,
}: Input) => {
  const webhooks = new WebhookService({
    hooks,
    settings,
    secrets,
    tokens: randomTokenIssuer,
    sealedJobs,
    transport: createHttpWebhookTransport(egressFetch('webhook'), (url) =>
      checkUrl('webhook', url),
    ),
    ids: uuidV7,
    clock: systemClock,
    logger,
  });

  webhooks.subscribe(hooks.core('core:webhooks'));
  jobs.handle(WEBHOOK_JOB, (payload) => webhooks.deliver(payload));

  return webhooks;
};
