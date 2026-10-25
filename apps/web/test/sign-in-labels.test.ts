import { expect, test } from 'bun:test';
import { CORE_SECOND_FACTORS, CORE_SIGN_IN_METHODS } from '@cms/sdk';
import { en } from '#lib/i18n/en.js';
import { ko } from '#lib/i18n/ko.js';
import {
  credentialLabel,
  factorLabel,
  fieldLabel,
  methodLabel,
} from '#lib/sign-in-labels.js';
import { methodView, stepView } from '#lib/server/sign-in-view.js';

test('every core method and factor has catalog text in both languages', () => {
  for (const id of CORE_SIGN_IN_METHODS)
    for (const m of [en, ko])
      expect(methodLabel(m, { id, label: 'API' })).not.toBe('API');
  for (const id of CORE_SECOND_FACTORS)
    for (const m of [en, ko])
      expect(factorLabel(m, { id, label: 'API' })).not.toBe('API');
  expect(methodLabel(ko, { id: 'sso', label: 'Single sign-on' })).toBe(
    '싱글 사인온',
  );
  expect(factorLabel(ko, { id: 'totp', label: 'Authenticator app' })).toBe(
    '인증 앱',
  );
});

test('plugin methods, factors and fields keep the text the plugin provides', () => {
  expect(
    methodLabel(ko, { id: 'plugin:magic:link', label: 'Magic link' }),
  ).toBe('Magic link');
  expect(factorLabel(ko, { id: 'plugin:sms:code', label: 'SMS' })).toBe('SMS');
  // A plugin field named like a core one is still the plugin's.
  expect(
    fieldLabel(ko, {
      name: 'code',
      label: 'SMS code',
      owner: 'plugin:sms:code',
    }),
  ).toBe('SMS code');
  expect(fieldLabel(ko, { name: 'code', label: 'Code', owner: null })).toBe(
    'Code',
  );
  expect(methodLabel(ko, { id: 'constructor', label: 'Odd' })).toBe('Odd');
});

test('core fields are translated by their owner', () => {
  const login = methodView({
    id: 'password',
    label: 'Password',
    options: [],
    fields: [
      { name: 'email', label: 'Email', type: 'email', required: true },
      { name: 'password', label: 'Password', type: 'password', required: true },
    ],
  });
  expect(login.fields.map((field) => fieldLabel(ko, field))).toEqual([
    '이메일',
    '비밀번호',
  ]);
  const setup = methodView({
    id: 'password',
    label: 'Password',
    options: [],
    fields: [
      {
        name: 'password',
        label: 'New password',
        type: 'password',
        autocomplete: 'new-password',
        required: true,
      },
    ],
  });
  expect(fieldLabel(ko, setup.fields[0]!)).toBe('새 비밀번호');
  const code = {
    kind: 'fields' as const,
    fields: [
      { name: 'code', label: 'Code', type: 'code' as const, required: true },
    ],
    display: [],
    transaction: 't',
  };
  for (const [owner, expected] of [
    ['totp', '인증 코드'],
    ['recovery-code', '복구 코드'],
    [null, 'Code'],
  ] as const) {
    const view = stepView(code, owner);
    if (view.kind !== 'fields') throw new Error('fields step expected');
    expect(fieldLabel(ko, view.fields[0]!)).toBe(expected);
  }
});

test('a credential named only by its factor gets the translated label', () => {
  const passkey = { id: 'passkey', label: 'Passkey' };
  expect(credentialLabel(ko, passkey, { label: 'Passkey' })).toBe('패스키');
  expect(credentialLabel(ko, passkey, { label: '' })).toBe('패스키');
  expect(credentialLabel(ko, passkey, { label: 'YubiKey 5' })).toBe(
    'YubiKey 5',
  );
});
