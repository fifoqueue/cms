import type { EgressRule } from '@cms/sdk';
import type { createSecurity } from '#api/composition/security';
import type { JobRunner } from '#api/domain/jobs/job-runner';
import { EMAIL_JOB, EmailService } from '#api/domain/email/email-service';
import { createSmtpMailer } from '#api/infra/smtp-mailer';
import { createEmailDelivery } from '#api/infra/email-delivery';
import { emailEndpoint } from '#api/infra/http-mailer';
import { outbound } from '#api/infra/egress-policy';

type Input = Pick<
  ReturnType<typeof createSecurity>,
  'egress' | 'access' | 'egressFetch' | 'checkUrl'
> &
  Pick<
    ConstructorParameters<typeof EmailService>[0],
    'hooks' | 'settings' | 'secrets' | 'sealedJobs' | 'logger'
  > & {
    search: Pick<ReturnType<typeof createSecurity>['search'], 'getAdmin'>;
    jobs: Pick<JobRunner, 'handle'>;
  };

export const createEmail = async ({
  egress,
  access,
  egressFetch,
  checkUrl,
  hooks,
  settings,
  secrets,
  sealedJobs,
  logger,
  search,
  jobs,
}: Input) => {
  const smtp = createSmtpMailer(async (host, port, signal) =>
    outbound.resolveHost(host, port, { ...(await access('smtp')), signal }),
  );
  const delivery = createEmailDelivery({
    smtp,
    egressFetch,
    checkUrl,
    checkHost: async (service, host, port) =>
      outbound.resolveHost(host, port, await access(service)),
  });
  const email = new EmailService({
    transports: delivery.mailer,
    hooks,
    settings,
    secrets,
    ...delivery,
    sealedJobs,
    logger,
  });
  await egress.initialize(async () => {
    const [searchSettings, emailSettings] = await Promise.all([
      search.getAdmin(),
      email.getAdmin(),
    ]);
    const rules: EgressRule[] = [];
    if (searchSettings.host) {
      const url = new URL(searchSettings.host);
      const rule = await outbound.compatibilityRule(
        'search',
        url.hostname,
        url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80,
      );
      if (rule) rules.push(rule);
    }
    if (emailSettings.transport === 'http') {
      const endpoint = emailEndpoint(emailSettings.http);
      if (endpoint) {
        const url = new URL(endpoint);
        const rule = await outbound.compatibilityRule(
          'email-api',
          url.hostname,
          url.port ? Number(url.port) : 443,
        );
        if (rule) rules.push(rule);
      }
    } else if (emailSettings.smtp.host) {
      const rule = await outbound.compatibilityRule(
        'smtp',
        emailSettings.smtp.host,
        emailSettings.smtp.port,
      );
      if (rule) rules.push(rule);
    }
    return rules;
  });
  jobs.handle(EMAIL_JOB, (payload) => email.deliver(payload));
  return { delivery, email };
};
