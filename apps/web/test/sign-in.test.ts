import { expect, test } from 'bun:test';
import {
  echoValues,
  fieldValues,
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
