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
  const queue = new MemoryJobQueue();
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
    sealedJobs: new SealedJobs(queue, secrets),
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
    queue,
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

test('system mail stays outside body filters without a system handler or explicit sensitive flag', async () => {
  const { email, hooks, messages, queue } = fixture();
  const actionUrl = 'https://site.example/admin/password?token=SECRET';
  const systemMessage: EmailMessage = {
    ...message,
    text: `Reset:\n${actionUrl}`,
    system: {
      kind: 'reset',
      actionUrl,
      context: {
        user: { id: 'reader', name: 'Reader', email: message.to },
        site: { title: 'Site', url: 'https://site.example', locale: 'en' },
      },
    },
  };
  const seen: unknown[] = [];

  await email.update(configured());
  hooks.registrar('observer').filter('email.beforeSend', (value) => {
    seen.push(value);

    return value;
  });
  await email.queue(systemMessage);

  for (const job of queue.rows.values()) await email.deliver(job.payload);
  await email.sendNow(systemMessage);
  expect(seen).toEqual([]);
  expect(messages).toHaveLength(2);

  for (const sent of messages) {
    expect(sent.text).toBe(`Reset:\n${actionUrl}`);
    expect(sent.sensitive).toBe(true);
  }
});

test('a later send filter can allow mail an earlier one refused', async () => {
  const { email, hooks, messages } = fixture();

  await email.update(configured());
  hooks
    .registrar('deny')
    .filter('email.sendAllowed', (value) => ({ ...value, allowed: false }));
  await expect(email.deliver(message)).rejects.toThrow();
  expect(messages).toEqual([]);
  hooks
    .registrar('grant')
    .filter('email.sendAllowed', (value) => ({ ...value, allowed: true }));
  await email.deliver(message);
  expect(messages).toEqual([message]);
});

test('mail filters sanitize HTML and preserve sender domain and envelope boundaries', async () => {
  const { email, hooks, messages, sent } = fixture();

  await email.update(configured());
  hooks.registrar('format').filter('email.beforeSend', (value) => ({
    ...value,
    html: '<p>Hello</p><script>alert(1)</script>',
    replyTo: 'support@example.com',
    headers: { 'X-Priority': '3' },
  }));
  hooks.registrar('sender').filter('email.from', () => ({
    name: 'Support',
    address: 'support@example.com',
  }));
  hooks.registrar('invalid').filter('email.from', () => ({
    name: 'Attacker',
    address: 'attacker@example.org',
  }));
  hooks.registrar('invalid').filter('email.beforeSend', (value) => ({
    ...value,
    headers: { Bcc: 'attacker@example.org' },
  }));
  await email.deliver(message);
  expect(messages[0]?.html).toContain('<p>Hello</p>');
  expect(messages[0]?.html).not.toContain('<script');
  expect(messages[0]?.replyTo).toBe('support@example.com');
  expect(messages[0]?.headers).toEqual({ 'X-Priority': '3' });
  expect(messages[0]?.text).toBe('Body');
  expect(sent[0]?.from).toEqual({
    name: 'Support',
    email: 'support@example.com',
  });
});
