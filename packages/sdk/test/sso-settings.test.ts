import { expect, test } from 'bun:test';
import {
  adminSsoSettingsSchema,
  ssoSettingsInputSchema,
  ssoSettingsSchema,
} from '#sdk/sso-settings';

test('provider ids are unique and enabled-provider issues identify their row', () => {
  const duplicate = ssoSettingsInputSchema.safeParse({
    passwordLogin: true,
    providers: [{ id: 'company' }, { id: 'company' }],
  });
  expect(duplicate.success).toBe(false);
  if (!duplicate.success)
    expect(duplicate.error.issues[0]?.path).toEqual(['providers', 1, 'id']);
  const missing = ssoSettingsInputSchema.safeParse({
    passwordLogin: false,
    providers: [{ id: 'company', enabled: true }],
  });
  expect(missing.success).toBe(false);
  if (!missing.success)
    expect(missing.error.issues[0]?.path).toEqual(['providers', 0, 'issuer']);
});

test('subject keys retain exact bytes and secrets never enter administrator DTOs', () => {
  const settings = ssoSettingsSchema.parse({
    providers: [
      {
        id: 'company',
        allowedSubjects: {
          Alice: 'admin@example.com',
          'Alice ': 'other@example.com',
        },
      },
    ],
  });
  expect(settings).not.toHaveProperty('passwordLogin');
  expect(settings.providers[0]?.allowedSubjects).toEqual({
    Alice: 'admin@example.com',
    'Alice ': 'other@example.com',
  });
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
  expect(dto).not.toHaveProperty('passwordLoginForced');
});

test('secret omission and explicit removal remain distinct in provider input', () => {
  const parsed = ssoSettingsInputSchema.parse({
    passwordLogin: true,
    providers: [{ id: 'keep' }, { id: 'remove', clientSecret: '' }],
  });
  expect(parsed.providers[0]).not.toHaveProperty('clientSecret');
  expect(parsed.providers[1]?.clientSecret).toBe('');
});

test('legacy passwordLogin input is optional and is never part of stored/output SSO settings', () => {
  for (const passwordLogin of [true, false, undefined]) {
    const input = ssoSettingsInputSchema.parse({
      providers: [],
      passwordLogin,
    });
    expect(ssoSettingsSchema.parse(input)).toEqual({ providers: [] });
  }
});
