import type { AdminEmailSettings } from '@cms/sdk';
import { EMAIL_PROVIDERS } from '@cms/sdk';
import { MailTransportRegistry } from '#api/domain/email/transport-registry';
import type { EmailMessage, MailTransport } from '#api/domain/email/ports';
import { createHttpMailer, emailEndpoint } from '#api/infra/http-mailer';

type Destination = Pick<AdminEmailSettings, 'transport'> & {
  smtp: Pick<AdminEmailSettings['smtp'], 'host' | 'port'>;
  http: Omit<AdminEmailSettings['http'], 'secretConfigured'>;
};

/** Composition shared by the container and routing tests; egress stays service-scoped. */
export function createEmailDelivery(deps: {
  smtp: {
    send(
      transport: Extract<MailTransport, { kind: 'smtp' }>,
      message: EmailMessage,
    ): Promise<void>;
  };
  egressFetch: (service: 'email-api') => Parameters<typeof createHttpMailer>[0];
  checkUrl: (service: 'email-api', url: string) => Promise<unknown>;
  checkHost: (service: 'smtp', host: string, port: number) => Promise<unknown>;
}): {
  mailer: MailTransportRegistry;
  checkDestination: (settings: Destination) => Promise<void>;
} {
  const http = createHttpMailer(deps.egressFetch('email-api'));
  const mailer = new MailTransportRegistry();
  mailer.register('smtp', {
    send: async (transport, message) => {
      if (transport.kind === 'smtp') await deps.smtp.send(transport, message);
    },
  });
  for (const provider of EMAIL_PROVIDERS)
    mailer.register(`http:${provider}`, {
      send: async (transport, message) => {
        if (transport.kind === 'http') await http.send(transport, message);
      },
    });
  return {
    mailer,
    checkDestination: async (settings) => {
      if (settings.transport === 'http')
        await deps.checkUrl('email-api', emailEndpoint(settings.http));
      else await deps.checkHost('smtp', settings.smtp.host, settings.smtp.port);
    },
  };
}
