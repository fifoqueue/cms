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
        sent.push(transport);
        messages.push(message);
      },
    },
    checkDestination: async (settings) => {
      destinations.push(settings.transport);
    },
  });
  return { settings, secrets, sent, destinations, email, hooks, messages };
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
test('mail filters validate output and denial cannot be reversed', async () => {
  const { email, hooks, sent } = fixture();
  await email.update(configured());
  const plugin = hooks.registrar('test');
  const recipients: string[] = [];
  plugin.on('email.sent', ({ to }) => {
    recipients.push(to);
  });
  plugin.filter('email.beforeSend', (value) => ({
    ...value,
    to: 'filtered@example.com',
  }));
  plugin.filter('email.beforeSend', (value) => ({
    ...value,
    to: 'invalid',
  }));
  await email.deliver(message);
  expect(recipients).toEqual([message.to]);
  plugin.filter('email.sendAllowed', (value) => ({ ...value, allowed: false }));
  plugin.filter('email.sendAllowed', (value) => ({ ...value, allowed: true }));
  await expect(email.deliver(message)).rejects.toMatchObject({
    name: 'PermanentJobError',
  });
  expect(sent).toHaveLength(1);
});
for (const change of [
  { provider: 'custom' },
  { url: 'https://other.example.com' },
  { authHeader: 'X-Key' },
  { keyId: 'other' },
]) {
  test(`credential binding rejects ${JSON.stringify(change)}`, async () => {
    const { email } = fixture();
    const admin = await email.update(configured());
    await expect(
      email.update({ ...admin, http: { ...admin.http, ...change } }),
    ).rejects.toMatchObject({
      code: 'invalid_input',
      issues: [
        {
          path: 'http.secret',
          message: 'Enter an API secret to enable HTTP email delivery',
        },
      ],
    });
    expect(await email.getAdmin()).toEqual(admin);
    await email.update({
      ...admin,
      http: { ...admin.http, ...change, secret: 'replacement' },
    });
  });
}

test('unopenable secret does not send', async () => {
  const { email, settings, sent } = fixture();
  await email.update({ ...configured(), transport: 'http' });
  const stored = (await settings.get('email')) as Record<string, unknown>;
  await settings.set('email', {
    ...stored,
    secret: aesSecretBox('different-key').seal('secret'),
  });
  await expect(email.deliver(message)).rejects.toThrow();
  expect(sent).toEqual([]);
});

test('legacy settings migrate on read without losing sealed SMTP password', async () => {
  const { settings, secrets, email, sent } = fixture();
  const password = secrets.seal('legacy-password');
  await settings.set('email', {
    settings: {
      enabled: true,
      host: 'legacy.example.com',
      port: 465,
      security: 'tls',
      username: 'user',
      fromName: 'Legacy',
      fromEmail: 'legacy@example.com',
    },
    password,
  });
  const admin = await email.getAdmin();
  expect(admin.transport).toBe('smtp');
  expect(admin.smtp).toEqual({
    host: 'legacy.example.com',
    port: 465,
    security: 'tls',
    username: 'user',
    passwordConfigured: true,
  });
  expect(admin.http.secretConfigured).toBe(false);
  await email.deliver(message);
  expect(sent[0]).toMatchObject({
    kind: 'smtp',
    password: 'legacy-password',
    from: { name: 'Legacy', email: 'legacy@example.com' },
  });
  await email.update(admin);
  const stored = (await settings.get('email')) as {
    settings: { transport: string };
    password: string;
    secret: string;
  };
  expect(stored.settings.transport).toBe('smtp');
  expect(stored.password).toBe(password);
  expect(stored.secret).toBe('');
});

test('both credentials are sealed, kept when omitted and independently removable', async () => {
  const { settings, secrets, email, sent, destinations } = fixture();
  let admin = await email.update(configured());
  const stored = (await settings.get('email')) as {
    password: string;
    secret: string;
  };
  expect(stored.password).not.toBe('smtp-password');
  expect(stored.secret).not.toBe('http-secret');
  expect(secrets.open(stored.password)).toBe('smtp-password');
  expect(secrets.open(stored.secret)).toBe('http-secret');
  admin = await email.update({ ...admin, transport: 'http' });
  await email.deliver(message);
  expect(sent[0]).toMatchObject({ kind: 'http', secret: 'http-secret' });
  expect(admin.smtp.host).toBe('smtp.example.com');
  admin = await email.update({ ...admin, transport: 'smtp' });
  await email.deliver(message);
  expect(sent[1]).toMatchObject({ kind: 'smtp', password: 'smtp-password' });
  expect(admin.http.provider).toBe('sendgrid');
  admin = await email.update({
    ...admin,
    smtp: { ...admin.smtp, password: '' },
  });
  expect(admin.smtp.passwordConfigured).toBe(false);
  expect(admin.http.secretConfigured).toBe(true);
  admin = await email.update({ ...admin, http: { ...admin.http, secret: '' } });
  expect(admin.http.secretConfigured).toBe(false);
  expect(destinations).toEqual(['smtp', 'http', 'smtp', 'smtp', 'smtp']);
});

test('enabled HTTP requires a stored or new secret and rejects removal atomically', async () => {
  const { email, destinations } = fixture();
  const input = {
    ...configured(),
    transport: 'http',
    http: { ...DEFAULT_EMAIL_SETTINGS.http },
  };
  await expect(email.update(input)).rejects.toMatchObject({
    code: 'invalid_input',
    issues: [
      {
        path: 'http.secret',
        message: 'Enter an API secret to enable HTTP email delivery',
      },
    ],
  });
  expect(destinations).toEqual([]);
  const admin = await email.update({
    ...input,
    http: { ...input.http, secret: 'new-secret' },
  });
  await expect(
    email.update({ ...admin, http: { ...admin.http, secret: '' } }),
  ).rejects.toMatchObject({ code: 'invalid_input' });
  expect((await email.getAdmin()).http.secretConfigured).toBe(true);
  const disabled = await email.update({
    ...admin,
    enabled: false,
    http: { ...admin.http, secret: '' },
  });
  expect(disabled.http.secretConfigured).toBe(false);
});
