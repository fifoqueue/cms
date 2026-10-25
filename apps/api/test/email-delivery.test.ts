import { expect, test } from 'bun:test';
import { DEFAULT_EMAIL_SETTINGS, EMAIL_PROVIDERS } from '@cms/sdk';
import { MailTransportRegistry } from '#api/domain/email/transport-registry';
import type { MailTransport, EmailMessage } from '#api/domain/email/ports';
import { createEmailDelivery } from '#api/infra/email-delivery';

const message = { to: 'reader@example.com', subject: 'Hello', text: 'Body' };
const from = { name: 'Site', email: 'site@example.com' };
const smtp: Extract<MailTransport, { kind: 'smtp' }> = {
  ...DEFAULT_EMAIL_SETTINGS.smtp,
  kind: 'smtp',
  host: 'smtp.example.com',
  password: 'password',
  from,
};
const http: Extract<MailTransport, { kind: 'http' }> = {
  ...DEFAULT_EMAIL_SETTINGS.http,
  kind: 'http',
  provider: 'resend',
  secret: 'api-secret',
  from,
};

function fixture() {
  const services: string[] = [];
  const requests: { service: string; url: string; init: RequestInit }[] = [];
  const sent: { transport: MailTransport; message: EmailMessage }[] = [];
  const checked: unknown[][] = [];
  const delivery = createEmailDelivery({
    smtp: {
      send: async (transport, message) => {
        sent.push({ transport, message });
      },
    },
    egressFetch: (service) => {
      services.push(service);
      return async (url, init) => {
        requests.push({ service, url, init });
        return new Response(null, { status: 202 });
      };
    },
    checkUrl: async (service, url) => {
      checked.push([service, url]);
    },
    checkHost: async (service, host, port) => {
      checked.push([service, host, port]);
    },
  });
  return { ...delivery, services, requests, sent, checked };
}

test('container delivery sends HTTP exclusively through email-api egress fetch', async () => {
  const { mailer, services, requests, sent } = fixture();
  await mailer.send(http, message);
  expect(services).toEqual(['email-api']);
  expect(requests).toHaveLength(1);
  expect(requests[0]).toMatchObject({
    service: 'email-api',
    url: 'https://api.resend.com/emails',
    init: { method: 'POST' },
  });
  expect(JSON.parse(String(requests[0]!.init.body))).toMatchObject({
    to: [message.to],
    subject: message.subject,
    text: message.text,
  });
  expect(sent).toEqual([]);
});

test('every core provider is registered through the mail registry', () => {
  expect(fixture().mailer.ids()).toEqual([
    'smtp',
    ...EMAIL_PROVIDERS.map((provider) => `http:${provider}`),
  ]);
});

test('selected transport failures and removal never fall back', async () => {
  const registry = new MailTransportRegistry();
  let fallback = 0;
  registry.register('smtp', {
    send: async () => {
      fallback++;
    },
  });
  const release = registry.register(
    'http:resend',
    {
      send: async () => {
        throw new Error('provider unavailable');
      },
    },
    50,
  );
  await expect(registry.send(http, message)).rejects.toThrow();
  release();
  await expect(registry.send(http, message)).rejects.toThrow();
  expect(fallback).toBe(0);
});

test('container delivery sends SMTP exclusively through the SMTP adapter', async () => {
  const { mailer, requests, sent } = fixture();
  await mailer.send(smtp, message);
  expect(sent).toEqual([{ transport: smtp, message }]);
  expect(requests).toEqual([]);
});

test('destination checks use the active transport and service, including custom URLs', async () => {
  const { checkDestination, checked } = fixture();
  await checkDestination({ transport: 'http', smtp, http });
  await checkDestination({
    transport: 'http',
    smtp,
    http: {
      ...http,
      provider: 'custom',
      url: 'https://mail.example.com:8443/send',
    },
  });
  await checkDestination({ transport: 'smtp', smtp, http });
  expect(checked).toEqual([
    ['email-api', 'https://api.resend.com/emails'],
    ['email-api', 'https://mail.example.com:8443/send'],
    ['smtp', 'smtp.example.com', 587],
  ]);
});

test('destination rejection propagates instead of permitting a blocked endpoint', async () => {
  const denied = new Error('blocked');
  const delivery = createEmailDelivery({
    smtp: { send: async () => {} },
    egressFetch: () => async () => new Response(null, { status: 202 }),
    checkUrl: async () => {
      throw denied;
    },
    checkHost: async () => {
      throw denied;
    },
  });
  for (const transport of ['smtp', 'http'] as const)
    await expect(
      delivery.checkDestination({ transport, smtp, http }),
    ).rejects.toBe(denied);
});
