import { describe, expect, test } from 'bun:test';
import {
  DEFAULT_EMAIL_SETTINGS,
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
