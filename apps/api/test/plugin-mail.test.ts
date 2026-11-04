import { expect, test } from 'bun:test';
import { DEFAULT_EMAIL_SETTINGS } from '@cms/sdk';
import { EmailService } from '#api/domain/email/email-service';
import { MailTransportRegistry } from '#api/domain/email/transport-registry';
import { SealedJobs } from '#api/domain/jobs/sealed-jobs';
import { aesSecretBox } from '#api/infra/secret-box';
import { MemorySettings } from '#test/support/memory';
import { MemoryJobQueue } from '#test/support/memory-jobs';
import { HookBus } from '#api/plugin-runtime/hook-bus';
import { recordingLogger } from '#test/support/memory';

test('mail filters cannot transfer credentials to another plugin and actions retain committed configuration', async () => {
  const transports = new MailTransportRegistry();
  const settings = new MemorySettings();
  const secrets = aesSecretBox('plugin-mail-hooks');
  const { logger, lines } = recordingLogger();
  const hooks = new HookBus({ logger, timeoutMs: 100 });
  const announced: unknown[] = [];

  for (const owner of ['original', 'other'])
    transports.plugin(owner, 'mail', {
      label: owner,
      fields: [
        { key: 'token', label: 'Token', type: 'secret', required: true },
      ],
      send: async () => {},
    });
  const email = new EmailService({
    settings,
    secrets,
    hooks,
    transports,
    mailer: transports,
    sealedJobs: new SealedJobs(new MemoryJobQueue(), secrets),
  });
  const registrar = hooks.registrar('functions:site', { trusted: true });

  registrar.on('settings.updated', (value) => {
    announced.push(structuredClone(value));
  });
  const release = registrar.filter('settings.beforeSave', (value) =>
    value.section === 'email' && value.settings.pluginTransport
      ? {
          ...value,
          settings: {
            ...value.settings,
            pluginTransport: {
              ...value.settings.pluginTransport,
              id: 'plugin:other:mail',
            },
          },
        }
      : value,
  );
  const saved = await email.update({
    ...DEFAULT_EMAIL_SETTINGS,
    pluginTransport: {
      id: 'plugin:original:mail',
      values: {},
      secrets: { token: 'private' },
    },
  });

  expect(saved.pluginTransport).toMatchObject({
    id: 'plugin:original:mail',
    secretsConfigured: ['token'],
  });
  expect(
    lines.some(
      (line) =>
        line.startsWith('warn ') && line.includes('settings.beforeSave'),
    ),
  ).toBe(true);
  release();
  const discard = registrar.filter('settings.beforeSave', (value) =>
    value.section === 'email'
      ? {
          ...value,
          settings: {
            ...value.settings,
            pluginTransport: null,
            fromName: 'must-not-commit',
          },
        }
      : value,
  );
  const warnings = lines.length;
  const retained = await email.update({
    ...DEFAULT_EMAIL_SETTINGS,
    pluginTransport: {
      id: 'plugin:original:mail',
      values: {},
      secrets: {},
    },
  });

  expect(retained).toEqual(saved);
  expect(announced.at(-1)).toEqual({ section: 'email', settings: saved });
  expect(
    lines
      .slice(warnings)
      .some(
        (line) =>
          line.startsWith('warn ') && line.includes('settings.beforeSave'),
      ),
  ).toBe(true);
  discard();
  await email.update({ ...DEFAULT_EMAIL_SETTINGS, pluginTransport: undefined });
  expect(announced.at(-1)).toEqual({
    section: 'email',
    settings: await email.getAdmin(),
  });
  expect(announced.at(-1)).toMatchObject({
    settings: {
      pluginTransport: {
        id: 'plugin:original:mail',
        secretsConfigured: ['token'],
      },
    },
  });
  expect(JSON.stringify(announced)).not.toContain('private');
});

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
