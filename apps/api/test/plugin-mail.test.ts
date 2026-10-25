import { expect, test } from 'bun:test';
import { DEFAULT_EMAIL_SETTINGS } from '@cms/sdk';
import { EmailService } from '#api/domain/email/email-service';
import { MailTransportRegistry } from '#api/domain/email/transport-registry';
import { SealedJobs } from '#api/domain/jobs/sealed-jobs';
import { aesSecretBox } from '#api/infra/secret-box';
import { MemorySettings } from '#test/support/memory';
import { MemoryJobQueue } from '#test/support/memory-jobs';

test('plugin mail selection seals secrets, preserves omitted credentials and fails closed on removal', async () => {
  const transports = new MailTransportRegistry();
  const sent: unknown[] = [];
  const release = transports.plugin('example', 'mail', {
    label: 'Example',
    fields: [
      { key: 'region', label: 'Region', type: 'text', required: true },
      { key: 'token', label: 'Token', type: 'secret', required: true },
    ],
    send: async (input) => {
      sent.push(input);
    },
  });
  const settings = new MemorySettings();
  const secrets = aesSecretBox('plugin-mail-test');
  const email = new EmailService({
    settings,
    secrets,
    mailer: transports,
    transports,
    sealedJobs: new SealedJobs(new MemoryJobQueue(), secrets),
  });
  const input = {
    ...DEFAULT_EMAIL_SETTINGS,
    enabled: true,
    fromEmail: 'site@example.com',
    pluginTransport: {
      id: 'plugin:example:mail',
      values: { region: 'eu' },
      secrets: { token: 'private-token' },
    },
  };
  const admin = await email.update(input);
  expect(JSON.stringify(admin)).not.toContain('private-token');
  expect(JSON.stringify(await settings.get('email'))).not.toContain(
    'private-token',
  );
  expect(admin.pluginTransport?.secretsConfigured).toEqual(['token']);
  await email.update({
    ...input,
    pluginTransport: { ...input.pluginTransport, secrets: {} },
  });
  const message = { to: 'reader@example.com', subject: 'Hi', text: 'Body' };
  await email.deliver(message);
  expect(sent).toEqual([
    {
      ...message,
      from: { name: '', email: 'site@example.com' },
      settings: { region: 'eu', token: 'private-token' },
    },
  ]);
  release();
  await expect(email.deliver(message)).rejects.toThrow();
  expect(sent).toHaveLength(1);
});
