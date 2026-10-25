import { expect, test } from 'bun:test';
import { generate } from 'lean-qr';
import { signInSettingsSchema } from '@cms/sdk';
import { Errors as SdkErrors } from '@cms/sdk/errors';
import { errorMessage, issueText } from '#lib/admin/form-errors.js';
import { SIGN_IN_MESSAGES, VISITOR_MESSAGES } from '#lib/admin/sso-messages.js';
import {
  factorRows,
  methodRows,
  moveItem,
  readMove,
  readSignInForm,
  signInInput,
  signInIssueTarget,
  signInValues,
} from '#lib/admin/settings/sign-in-form.js';
import { en } from '#lib/i18n/en.js';
import { ko } from '#lib/i18n/ko.js';
import {
  displayView,
  echoValues,
  fieldValues,
  qrCode,
  redirectTarget,
  stepView,
} from '#lib/server/sign-in-view.js';

const formOf = (entries: [string, string][]) => {
  const form = new FormData();
  for (const [name, value] of entries) form.append(name, value);
  return form;
};

const code = {
  name: 'code',
  label: 'Code',
  type: 'code' as const,
  required: true,
};

test('steps become page data without their transaction, QR codes drawn as paths', () => {
  const view = stepView({
    kind: 'fields',
    fields: [code],
    display: [
      { kind: 'qr', value: 'otpauth://totp/CMS:a?secret=ABC' },
      { kind: 'code', text: 'ABC' },
    ],
    transaction: 'secret-handle',
  });
  expect(JSON.stringify(view)).not.toContain('secret-handle');
  expect(view).toMatchObject({
    kind: 'fields',
    message: null,
    display: [{ kind: 'qr' }, { kind: 'code', text: 'ABC' }],
  });
  expect(
    stepView({
      kind: 'enroll',
      factors: [{ id: 'plugin:sms:text', label: 'Text message' }],
      transaction: 't',
    }),
  ).toEqual({
    kind: 'factor',
    purpose: 'enroll',
    factors: [{ id: 'plugin:sms:text', label: 'Text message' }],
  });
});

test('the QR path covers exactly the dark modules of the code', () => {
  const value = 'otpauth://totp/CMS:a?secret=JBSWY3DPEHPK3PXP';
  const { size, path } = qrCode(value);
  const expected = generate(value);
  expect(size).toBe(expected.size);
  const dark = new Set<string>();
  for (const [, x, y, width] of path.matchAll(/M(\d+) (\d+)h(\d+)/g))
    for (let column = 0; column < Number(width); column += 1)
      dark.add(`${Number(x) + column},${y}`);
  for (let y = 0; y < size; y += 1)
    for (let x = 0; x < size; x += 1)
      expect(dark.has(`${x},${y}`)).toBe(expected.get(x, y));
});

test('only declared fields are sent, and secrets are never echoed back', () => {
  const fields = [
    { name: 'email', label: 'Email', type: 'email' as const, required: true },
    { name: 'password', label: 'P', type: 'password' as const, required: true },
    code,
  ];
  const values = fieldValues(
    formOf([
      ['field.email', 'a@example.com'],
      ['field.password', 'hunter2'],
      ['redirect_to', '/admin'],
    ]),
    fields,
  );
  expect(values).toEqual({
    email: 'a@example.com',
    password: 'hunter2',
    code: '',
  });
  expect(echoValues(values, fields)).toEqual({ email: 'a@example.com' });
});

test('a plugin field named like the form’s own inputs does not collide with them', () => {
  const fields = [
    { name: 'method', label: 'M', type: 'text' as const, required: true },
    { name: 'token', label: 'T', type: 'text' as const, required: true },
  ];
  const form = formOf([
    ['method', 'plugin:magic:link'],
    ['token', 'link-token'],
    ['field.method', 'typed method'],
    ['field.token', 'typed token'],
  ]);
  expect(fieldValues(form, fields)).toEqual({
    method: 'typed method',
    token: 'typed token',
  });
  expect(form.get('token')).toBe('link-token');
});

test('a value too long for a QR code is shown as a code to copy', () => {
  const value = 'x'.repeat(5000);
  expect(displayView({ kind: 'qr', value })).toEqual({
    kind: 'code',
    text: value,
  });
  expect(displayView({ kind: 'qr', value: 'otpauth://x' }).kind).toBe('qr');
});

test('redirect steps leave only for http(s) addresses with a readable expiry', () => {
  const expiresAt = '2030-01-01T00:00:00.000Z';
  expect(
    redirectTarget({ url: 'https://id.example/auth?x=1', expiresAt }),
  ).toBe('https://id.example/auth?x=1');
  expect(redirectTarget({ url: 'http://localhost:8080/a', expiresAt })).toBe(
    'http://localhost:8080/a',
  );
  for (const url of [
    'javascript:alert(1)',
    'data:text/html,x',
    '/relative',
    '',
  ])
    expect(redirectTarget({ url, expiresAt })).toBeNull();
  expect(
    redirectTarget({ url: 'https://id.example/', expiresAt: 'soon' }),
  ).toBeNull();
});

const settings = {
  methods: ['passkey', 'plugin:magic:link'],
  secondFactors: ['totp'],
  requireSecondFactor: ['administrator'],
  available: {
    methods: [
      { id: 'password', label: 'Password', source: 'core', ready: true },
      { id: 'passkey', label: 'Passkey', source: 'core', ready: true },
      { id: 'sso', label: 'SSO', source: 'core', ready: false },
    ],
    secondFactors: [],
  },
} as const;

test('saved settings list allowed methods first and keep inactive plugin ids', () => {
  const values = signInValues({
    ...settings,
    methods: [...settings.methods],
    secondFactors: [...settings.secondFactors],
    requireSecondFactor: [...settings.requireSecondFactor],
    available: {
      methods: [...settings.available.methods],
      secondFactors: [],
    },
  });
  expect(values.order).toEqual([
    'passkey',
    'plugin:magic:link',
    'password',
    'sso',
  ]);
  expect(
    methodRows(values.order, [...settings.available.methods]).find(
      (row) => row.id === 'plugin:magic:link',
    ),
  ).toEqual({
    id: 'plugin:magic:link',
    label: 'plugin:magic:link',
    source: null,
    ready: false,
  });
});

test('second factors keep their saved order, so saving does not reorder them', () => {
  const rows = factorRows(
    ['totp', 'plugin:sms:code', 'passkey'],
    [
      { id: 'passkey', label: 'Passkey', source: 'core' },
      { id: 'totp', label: 'Authenticator app', source: 'core' },
      { id: 'recovery-code', label: 'Recovery code', source: 'core' },
    ],
  );
  expect(rows.map(({ id }) => id)).toEqual([
    'totp',
    'plugin:sms:code',
    'passkey',
    'recovery-code',
  ]);
  expect(rows[1]).toEqual({
    id: 'plugin:sms:code',
    label: 'plugin:sms:code',
    source: null,
    ready: false,
  });
});

test('the form reads checked methods in posted order and moves without scripts', () => {
  const values = readSignInForm(
    formOf([
      ['order', 'sso'],
      ['order', 'password'],
      ['order', 'passkey'],
      ['order', 'sso'],
      ['methods', 'passkey'],
      ['methods', 'sso'],
      ['methods', 'not-listed'],
      ['secondFactors', 'totp'],
      ['requireSecondFactor', 'editor'],
    ]),
  );
  expect(values).toEqual({
    order: ['sso', 'password', 'passkey'],
    methods: ['sso', 'passkey'],
    secondFactors: ['totp'],
    requireSecondFactor: ['editor'],
  });
  expect(signInInput(values)).toEqual({
    methods: ['sso', 'passkey'],
    secondFactors: ['totp'],
    requireSecondFactor: ['editor'],
  });
  const move = readMove('2:up');
  expect(move).toEqual({ index: 2, offset: -1 });
  expect(moveItem(values.order, 2, -1)).toEqual(['sso', 'passkey', 'password']);
  expect(moveItem(values.order, 0, -1)).toEqual(values.order);
  expect(readMove('x:up')).toBeNull();
});

test('issues land on the method they name, including nested list indexes', () => {
  const values = readSignInForm(
    formOf([
      ['order', 'password'],
      ['order', 'passkey'],
      ['secondFactors', 'totp'],
      ['secondFactors', 'totp-x'],
    ]),
  );
  const empty = signInSettingsSchema.safeParse(signInInput(values));
  if (empty.success) throw new Error('expected a refusal');
  expect(
    signInIssueTarget(empty.error.issues[0]!.path.join('.'), values),
  ).toEqual({ list: 'methods', id: null });
  expect(signInIssueTarget('secondFactors.1', values)).toEqual({
    list: 'secondFactors',
    id: 'totp-x',
  });
  expect(signInIssueTarget('secondFactors.9', values)).toBeNull();
  expect(signInIssueTarget('methods.0.extra', values)).toBeNull();
  expect(signInIssueTarget('other', values)).toBeNull();
});

test('sign-in refusals show catalog text in both languages', () => {
  expect(
    errorMessage(ko, 'ko', {
      message: SdkErrors.InvalidCredentials,
      code: 'unauthorized',
    }),
  ).toBe('이메일 또는 비밀번호가 올바르지 않습니다.');
  expect(
    errorMessage(ko, 'ko', {
      message: SdkErrors.SsoAccountLinkedElsewhere,
      code: 'conflict',
    }),
  ).toBe(ko.authSsoAccountLinkedElsewhere);
  for (const key of [
    ...Object.values(SIGN_IN_MESSAGES),
    ...Object.values(VISITOR_MESSAGES),
  ]) {
    expect(typeof en[key]).toBe('string');
    expect(typeof ko[key]).toBe('string');
  }
  expect(
    errorMessage(ko, 'ko', {
      message: SdkErrors.SignInMethodRequired,
      code: 'invalid_input',
    }),
  ).toBe(ko.signInMethodRequired);
  expect(
    errorMessage(ko, 'ko', {
      message: SdkErrors.RecoveryRecentSignIn,
      code: 'forbidden',
    }),
  ).toBe(ko.recoveryRecentSignIn);
  expect(
    errorMessage(ko, 'ko', {
      message: SdkErrors.RecentSignInRequired,
      code: 'unauthorized',
    }),
  ).toBe(ko.recentSignInRequired);
  expect(issueText(ko, 'ko', SdkErrors.SignInFactorRequired)).toBe(
    ko.signInFactorRequired,
  );
});
