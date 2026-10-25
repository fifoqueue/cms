import { expect, test } from 'bun:test';
import { DEFAULT_EMAIL_SETTINGS } from '@cms/sdk';
import { EmailService } from '#api/domain/email/email-service';
import type { EmailMessage, MailTransport } from '#api/domain/email/ports';
import { SealedJobs } from '#api/domain/jobs/sealed-jobs';
import { aesSecretBox } from '#api/infra/secret-box';
import { MemorySettings } from '#test/support/memory';
import { MemoryJobQueue } from '#test/support/memory-jobs';
import { HookBus } from '#api/plugin-runtime/hook-bus';

function fixture() {
  const settings = new MemorySettings();
  const secrets = aesSecretBox('email-service-tests');
  const sent: MailTransport[] = [];
  const messages: EmailMessage[] = [];
  const destinations: string[] = [];
  const failure: { error: unknown } = { error: null };
  const hooks = new HookBus({
    timeoutMs: 100,
    logger: { info() {}, warn() {}, error() {} },
  });
  const email = new EmailService({
    hooks,
    settings,
    secrets,
    sealedJobs: new SealedJobs(new MemoryJobQueue(), secrets),
    mailer: {
      send: async (transport, message) => {
        if (failure.error) throw failure.error;
        sent.push(transport);
        messages.push(message);
      },
    },
    checkDestination: async (settings) => {
      destinations.push(settings.transport);
    },
  });
  return {
    settings,
    secrets,
    sent,
    destinations,
    email,
    hooks,
    messages,
    failure,
  };
}
const configured = () => ({
  ...DEFAULT_EMAIL_SETTINGS,
  enabled: true,
  fromName: 'Site',
  fromEmail: 'site@example.com',
  smtp: {
    ...DEFAULT_EMAIL_SETTINGS.smtp,
    host: 'smtp.example.com',
    password: 'smtp-password',
  },
  http: { ...DEFAULT_EMAIL_SETTINGS.http, secret: 'http-secret' },
});
const message = { to: 'reader@example.com', subject: 'Test', text: 'Body' };
test('sensitive mail never reaches body filters while ordinary mail may change text', async () => {
  const { email, hooks, messages } = fixture();
  await email.update(configured());
  const seen: unknown[] = [];
  hooks.registrar('test').filter('email.beforeSend', (value) => {
    seen.push(value);
    return { ...value, subject: 'Changed', text: 'Changed' };
  });
  await email.deliver({ ...message, sensitive: true });
  expect(messages[0]).toEqual({ ...message, sensitive: true });
  expect(seen).toEqual([]);
  await email.deliver(message);
  expect(seen).toEqual([message]);
  expect(messages[1]).toEqual({
    ...message,
    subject: 'Changed',
    text: 'Changed',
  });
});
