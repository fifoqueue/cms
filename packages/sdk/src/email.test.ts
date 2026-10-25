import { describe, expect, test } from 'bun:test';
import {
  DEFAULT_EMAIL_SETTINGS,
  EMAIL_PROVIDERS,
  adminEmailSettingsSchema,
  emailSettingsInputSchema,
} from '#sdk/email';
import type { EmailProvider, EmailSettingsInput } from '#sdk/email';

const input = (provider: EmailProvider = 'sendgrid'): EmailSettingsInput => ({
  ...DEFAULT_EMAIL_SETTINGS,
  enabled: true,
  fromName: 'Example',
  fromEmail: 'sender@example.com',
  transport: 'http',
  smtp: { ...DEFAULT_EMAIL_SETTINGS.smtp, host: 'smtp.example.com' },
  http: {
    ...DEFAULT_EMAIL_SETTINGS.http,
    provider,
    region: provider === 'ses' ? 'us-east-1' : '',
    domain: 'mail.example.com',
    keyId: 'access-key',
    url: 'https://mail.example.com/send',
    bodyTemplate: '{"to": {{to}}, "subject": {{subject}}, "text": {{text}}}',
  },
});

describe('email settings contract', () => {
  test('rejects unknown placeholders, unsafe headers, controls and invalid domains', () => {
    for (const overrides of [
      { bodyTemplate: '{"text": {{unknown}}}' },
      { bodyTemplate: '{"text": "{{unknown}}"}' },
      ...[
        'Host',
        'Content-Type',
        'content-length',
        'Transfer-Encoding',
        'connection',
        'accept',
      ].map((authHeader) => ({ authHeader })),
      { secret: 'key\r\n' },
      { keyId: 'key\u007f' },
      { domain: '../example.com' },
      { domain: '-bad.example' },
    ]) {
      const settings = input('custom');
      Object.assign(settings.http, overrides);
      expect(emailSettingsInputSchema.safeParse(settings).success).toBe(false);
    }
    const settings = input();
    settings.http.secret = '  token  ';
    settings.http.keyId = '  key  ';
    expect(emailSettingsInputSchema.parse(settings).http).toMatchObject({
      secret: 'token',
      keyId: 'key',
    });
  });
  test('defaults are a valid secret-free administrator DTO', () => {
    expect(adminEmailSettingsSchema.parse(DEFAULT_EMAIL_SETTINGS)).toEqual(
      DEFAULT_EMAIL_SETTINGS,
    );
    expect(
      emailSettingsInputSchema.safeParse(DEFAULT_EMAIL_SETTINGS).success,
    ).toBe(true);
  });

  for (const provider of EMAIL_PROVIDERS) {
    test(`${provider} accepts its required settings`, () => {
      expect(emailSettingsInputSchema.safeParse(input(provider)).success).toBe(
        true,
      );
    });
  }

  test('omitted secrets stay omitted and empty secrets request removal', () => {
    const settings = input();
    const kept = emailSettingsInputSchema.parse(settings);
    expect(kept.smtp.password).toBeUndefined();
    expect(kept.http.secret).toBeUndefined();
    settings.smtp.password = '';
    settings.http.secret = '';
    const removed = emailSettingsInputSchema.parse(settings);
    expect(removed.smtp.password).toBe('');
    expect(removed.http.secret).toBe('');
  });

  test('sender is required only while enabled', () => {
    const settings = input();
    settings.fromEmail = '';
    const result = emailSettingsInputSchema.safeParse(settings);
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.issues[0]?.path).toEqual(['fromEmail']);
    settings.enabled = false;
    expect(emailSettingsInputSchema.safeParse(settings).success).toBe(true);
  });

  test('only the active transport requires its connection fields', () => {
    const settings = input('ses');
    settings.http.region = '';
    settings.http.keyId = '';
    settings.transport = 'smtp';
    expect(emailSettingsInputSchema.safeParse(settings).success).toBe(true);
    settings.smtp.host = '';
    expect(emailSettingsInputSchema.safeParse(settings).success).toBe(false);
    settings.transport = 'http';
    settings.http.provider = 'resend';
    expect(emailSettingsInputSchema.safeParse(settings).success).toBe(true);
  });

  for (const [provider, field] of [
    ['mailgun', 'domain'],
    ['ses', 'region'],
    ['ses', 'keyId'],
    ['mailjet', 'keyId'],
    ['custom', 'url'],
    ['custom', 'bodyTemplate'],
  ] as const) {
    test(`${provider} requires ${field}`, () => {
      const settings = input(provider);
      settings.http[field] = '';
      const result = emailSettingsInputSchema.safeParse(settings);
      expect(result.success).toBe(false);
      if (!result.success)
        expect(result.error.issues.map((issue) => issue.path)).toContainEqual([
          'http',
          field,
        ]);
    });
  }

  test('regional providers accept EU and reject arbitrary regions', () => {
    for (const provider of ['sendgrid', 'mailgun', 'sparkpost'] as const) {
      const settings = input(provider);
      settings.http.region = 'eu';
      expect(emailSettingsInputSchema.safeParse(settings).success).toBe(true);
      settings.http.region = 'not-a-region';
      expect(emailSettingsInputSchema.safeParse(settings).success).toBe(false);
    }
  });

  test('SES rejects region injection', () => {
    const settings = input('ses');
    settings.http.region = 'us-east-1.example.com/path';
    expect(emailSettingsInputSchema.safeParse(settings).success).toBe(false);
  });

  test('custom endpoints require HTTPS, valid header names and JSON templates', () => {
    for (const overrides of [
      { url: 'http://example.com/send' },
      { url: 'not a URL' },
      { authHeader: 'Authorization\r\nInjected' },
      { bodyTemplate: '{"text": {{text}}' },
    ]) {
      const settings = input('custom');
      Object.assign(settings.http, overrides);
      expect(emailSettingsInputSchema.safeParse(settings).success).toBe(false);
    }
  });

  test('administrator serialization strips credentials', () => {
    const settings = input();
    const admin = adminEmailSettingsSchema.parse({
      ...settings,
      smtp: {
        ...settings.smtp,
        password: 'smtp-secret',
        passwordConfigured: true,
      },
      http: { ...settings.http, secret: 'api-secret', secretConfigured: true },
    });
    expect(admin.smtp.passwordConfigured).toBe(true);
    expect(admin.http.secretConfigured).toBe(true);
    expect(JSON.stringify(admin)).not.toContain('smtp-secret');
    expect(JSON.stringify(admin)).not.toContain('api-secret');
  });
});
