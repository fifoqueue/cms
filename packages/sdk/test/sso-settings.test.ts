import { expect, test } from 'bun:test';
import { adminSsoSettingsSchema, ssoSettingsSchema } from '#sdk/sso-settings';

test('secrets never enter administrator SSO DTOs', () => {
  const settings = ssoSettingsSchema.parse({ providers: [{ id: 'company' }] });
  const dto = adminSsoSettingsSchema.parse({
    ...settings,
    providers: settings.providers.map((provider) => ({
      ...provider,
      clientSecret: 'never-return-this',
      clientSecretConfigured: true,
    })),
    redirectUri: '',
    environmentProvider: null,
    passwordLoginForced: false,
    secrets: { company: 'sealed-secret' },
  });
  expect(JSON.stringify(dto)).not.toContain('never-return-this');
  expect(JSON.stringify(dto)).not.toContain('sealed-secret');
});
