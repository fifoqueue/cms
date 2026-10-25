import { expect, test } from 'bun:test';
import { DEFAULT_EMAIL_SETTINGS, emailSettingsInputSchema } from '@cms/sdk';
import { Errors as SdkErrors } from '@cms/sdk/errors';
import {
  EMAIL_ISSUE_MESSAGES,
  emailIssueText,
} from '#lib/admin/settings/email-issues.js';
import { readEmailForm } from '#lib/admin/settings/email-form.server.js';
import { en } from '#lib/i18n/en.js';
import { ko } from '#lib/i18n/ko.js';

test('every mapped email message has text in both catalogs', () => {
  for (const key of Object.values(EMAIL_ISSUE_MESSAGES)) {
    expect(typeof en[key]).toBe('string');
    expect(typeof ko[key]).toBe('string');
  }
});

test('schema refusals show catalog text in the reader language', () => {
  const result = emailSettingsInputSchema.safeParse({
    ...DEFAULT_EMAIL_SETTINGS,
    enabled: true,
  });
  if (result.success) throw new Error('expected a refusal');
  const issue = { path: 'smtp.host', message: SdkErrors.EmailServerRequired };
  expect(
    result.error.issues.some(({ message }) => message === issue.message),
  ).toBe(true);
  expect(emailIssueText(ko, 'ko', issue)).toBe(ko.emailServerRequired);
  expect(emailIssueText(en, 'en', issue)).toBe(en.emailServerRequired);
});

const formOf = (entries: Record<string, string>) => {
  const form = new FormData();
  for (const [name, value] of Object.entries(entries)) form.set(name, value);
  return form;
};

test('the email form reads the region field the provider shows', () => {
  const posted = { 'http.regionChoice': 'eu', 'http.region': 'ap-northeast-2' };
  for (const [provider, region] of [
    ['mailgun', 'eu'],
    ['sendgrid', 'eu'],
    ['ses', 'ap-northeast-2'],
    ['postmark', 'ap-northeast-2'],
  ])
    expect(
      readEmailForm(formOf({ ...posted, 'http.provider': provider })).values
        .http.region,
    ).toBe(region);
});

test('the email form keeps secrets out of its echoed values', () => {
  const { values, input } = readEmailForm(
    formOf({
      transport: 'http',
      'http.provider': 'nope',
      'smtp.port': 'x',
      'smtp.password': 'smtp-secret',
      'http.secret': 'api-secret',
    }),
  );
  expect(JSON.stringify(values)).not.toContain('secret');
  expect(values.http.provider).toBe('sendgrid');
  expect(values.smtp.port).toBe(587);
  expect(input.smtp.password).toBe('smtp-secret');
  expect(input.http.secret).toBe('api-secret');
  const kept = readEmailForm(formOf({ 'http.secretRemove': 'on' })).input;
  expect(kept.smtp.password).toBeUndefined();
  expect(kept.http.secret).toBe('');
});

const transports = [
  {
    id: 'plugin:mailer:api',
    label: 'Mailer',
    fields: [
      { key: 'region', label: 'Region', type: 'text' as const, required: true },
      {
        key: 'retries',
        label: 'Retries',
        type: 'number' as const,
        required: false,
      },
      {
        key: 'sandbox',
        label: 'Sandbox',
        type: 'boolean' as const,
        required: false,
      },
      { key: 'token', label: 'Token', type: 'secret' as const, required: true },
      {
        key: 'signing',
        label: 'Signing',
        type: 'secret' as const,
        required: false,
      },
    ],
  },
];

test('a plugin mail transport is read from its declared fields', () => {
  const { values, input } = readEmailForm(
    formOf({
      transport: 'plugin:mailer:api',
      legacyTransport: 'http',
      'plugin.plugin:mailer:api.region': 'eu',
      'plugin.plugin:mailer:api.retries': '3',
      'plugin.plugin:mailer:api.sandbox': 'on',
      'plugin.plugin:mailer:api.token': 'plugin-secret',
      'plugin.plugin:mailer:api.signing.remove': 'on',
    }),
    transports,
  );
  expect(input.transport).toBe('http');
  expect(input.pluginTransport).toEqual({
    id: 'plugin:mailer:api',
    values: { region: 'eu', retries: 3, sandbox: true },
    secrets: { token: 'plugin-secret', signing: '' },
  });
  expect(emailSettingsInputSchema.safeParse(input).success).toBe(true);
  expect(values.pluginTransport).toEqual({
    id: 'plugin:mailer:api',
    values: { region: 'eu', retries: 3, sandbox: true },
  });
  expect(JSON.stringify(values)).not.toContain('plugin-secret');
});

test('core transports and unknown plugin ids clear the plugin transport', () => {
  const smtp = readEmailForm(
    formOf({ transport: 'smtp', legacyTransport: 'http' }),
    transports,
  ).input;
  expect(smtp.transport).toBe('smtp');
  expect(smtp.pluginTransport).toBeNull();
  // A plugin removed since the page loaded keeps the saved core transport.
  const gone = readEmailForm(
    formOf({ transport: 'plugin:gone:api', legacyTransport: 'http' }),
    transports,
  ).input;
  expect(gone.transport).toBe('http');
  expect(gone.pluginTransport).toBeNull();
});

test('unknown email issues fall back to the generic text', () => {
  const issue = { path: 'fromEmail', message: 'Invalid email address' };
  expect(emailIssueText(ko, 'ko', issue)).toBe(ko.errorFieldInvalid);
  expect(emailIssueText(en, 'en', issue)).toBe(issue.message);
});
