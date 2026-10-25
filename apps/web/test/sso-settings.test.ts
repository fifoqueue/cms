import { expect, test } from 'bun:test';
import { ssoSettingsInputSchema } from '@cms/sdk';
import { Errors as SdkErrors } from '@cms/sdk/errors';
import { errorMessage, issueText } from '#lib/admin/form-errors.js';
import { SSO_MESSAGES } from '#lib/admin/sso-messages.js';
import {
  ssoIssueField,
  ssoProviderValues,
} from '#lib/admin/settings/sso-form.js';
import {
  readSsoProviders,
  readSubjects,
} from '#lib/admin/settings/sso-form.server.js';
import { en } from '#lib/i18n/en.js';
import { ko } from '#lib/i18n/ko.js';

const formOf = (entries: [string, string][]) => {
  const form = new FormData();
  for (const [name, value] of entries) form.append(name, value);
  return form;
};

test('every mapped single sign-on message has text in both catalogs', () => {
  for (const key of Object.values(SSO_MESSAGES)) {
    expect(typeof en[key]).toBe('string');
    expect(typeof ko[key]).toBe('string');
  }
});

test('known refusals and issues show catalog text in the reader language', () => {
  expect(
    errorMessage(ko, 'ko', {
      message: SdkErrors.SsoLastAccess,
      code: 'conflict',
    }),
  ).toBe(ko.ssoLastAccess);
  expect(issueText(ko, 'ko', SdkErrors.SsoProviderIdDuplicate)).toBe(
    ko.ssoProviderIdDuplicate,
  );
  expect(issueText(ko, 'ko', 'Invalid email address')).toBe(
    ko.errorFieldInvalid,
  );
  expect(issueText(en, 'en', 'Invalid email address')).toBe(
    'Invalid email address',
  );
});

test('subjects split at the last equals sign and keep malformed lines', () => {
  expect(
    readSubjects('abc== = a@example.com\r\n\n  plain  \nx=b@example.com'),
  ).toEqual({ 'abc==': 'a@example.com', plain: '', x: 'b@example.com' });
});

test('the provider form reads posted indexes in order, secrets kept out of values', () => {
  const { values, input } = readSsoProviders(
    formOf([
      ['providers.2.id', 'second'],
      ['providers.2.draft', 'client-1'],
      ['providers.2.authMethod', 'bogus'],
      ['providers.2.clientSecret', 'top-secret'],
      ['providers.0.id', 'first'],
      ['providers.0.enabled', 'on'],
      ['providers.0.clientSecret', 'ignored'],
      ['providers.0.clientSecretRemove', 'on'],
      ['providers.0.allowedSubjects', 'sub = A@Example.com'],
    ]),
  );
  expect(values.map(({ id }) => id)).toEqual(['first', 'second']);
  expect(JSON.stringify(values)).not.toContain('top-secret');
  expect(values[1]).toMatchObject({
    draft: 'client-1',
    enabled: false,
    authMethod: 'client_secret_basic',
  });
  expect(input[0]).toMatchObject({
    enabled: true,
    clientSecret: '',
    allowedSubjects: { sub: 'A@Example.com' },
  });
  expect(input[1]?.clientSecret).toBe('top-secret');
  expect(
    readSsoProviders(formOf([['providers.0.id', 'kept']])).input[0]
      ?.clientSecret,
  ).toBeUndefined();
});

test('a draft reusing a removed provider id never keeps its stored secret', () => {
  const { input } = readSsoProviders(
    formOf([
      ['providers.0.id', 'reused'],
      ['providers.0.draft', 'client-1'],
      ['providers.0.clientSecret', ''],
    ]),
  );
  expect(input[0]?.clientSecret).toBe('');
});

test('schema issues land on their provider field; others are listed apart', () => {
  const { input } = readSsoProviders(
    formOf([
      ['providers.0.id', 'dup'],
      ['providers.0.name', 'One'],
      ['providers.1.id', 'dup'],
      ['providers.1.name', 'Two'],
      ['providers.1.enabled', 'on'],
      ['providers.1.allowedSubjects', 'sub = not-an-address'],
    ]),
  );
  const result = ssoSettingsInputSchema.safeParse({ providers: input });
  if (result.success) throw new Error('expected a refusal');
  const fields = result.error.issues.map(({ path }) =>
    ssoIssueField(path.join('.')),
  );
  expect(fields).toContainEqual({ index: 1, field: 'id' });
  expect(fields).toContainEqual({ index: 1, field: 'issuer' });
  expect(fields).toContainEqual({ index: 1, field: 'allowedSubjects' });
  expect(ssoIssueField('providers')).toBeNull();
  expect(ssoIssueField('passwordLogin')).toBeNull();
});

test('saved providers become form values without secrets', () => {
  const [values] = ssoProviderValues([
    {
      id: 'corp',
      enabled: true,
      name: 'Corp',
      issuer: 'https://id.example.com',
      clientId: 'client',
      authMethod: 'none',
      scopes: 'openid email',
      allowedSubjects: { a: 'a@example.com', b: 'b@example.com' },
      clientSecretConfigured: true,
    },
  ]);
  expect(values).toEqual({
    draft: '',
    id: 'corp',
    enabled: true,
    name: 'Corp',
    issuer: 'https://id.example.com',
    clientId: 'client',
    authMethod: 'none',
    scopes: 'openid email',
    allowedSubjects: 'a = a@example.com\nb = b@example.com',
  });
});
