import { expect, test } from 'bun:test';
import {
  profileFieldRows,
  profileFieldsRefusal,
  profileIssueKey,
  readProfileFields,
  splitProfileIssues,
} from '#lib/admin/plugin-profile-fields.js';

const meta = {
  fields: [
    {
      key: 'crm:nickname',
      definition: { label: 'Nickname', type: 'text' as const, maxLength: 40 },
    },
    {
      key: 'crm:age',
      definition: { label: 'Age', type: 'number' as const, min: 0, max: 150 },
    },
    {
      key: 'news:opt-in',
      definition: { label: 'Newsletter', type: 'boolean' as const },
    },
  ],
  values: { 'crm:nickname': 'Kim', 'crm:age': 30 },
};

const formOf = (entries: [string, string][]) => {
  const form = new FormData();
  for (const [key, value] of entries) form.append(key, value);
  return form;
};

test('no declared fields render nothing', () => {
  expect(profileFieldRows({ fields: [], values: {} })).toEqual([]);
});

test('rows carry the declaring plugin, bounds and stored values', () => {
  expect(profileFieldRows(meta)).toEqual([
    {
      key: 'crm:nickname',
      label: 'Nickname',
      source: 'crm',
      type: 'text',
      maxLength: 40,
      value: 'Kim',
    },
    {
      key: 'crm:age',
      label: 'Age',
      source: 'crm',
      type: 'number',
      min: 0,
      max: 150,
      value: '30',
    },
    {
      key: 'news:opt-in',
      label: 'Newsletter',
      source: 'news',
      type: 'boolean',
      value: false,
    },
  ]);
  // After a refusal, what was typed shows again.
  expect(
    profileFieldRows(meta, { 'crm:age': 'abc', 'news:opt-in': true }).map(
      (row) => row.value,
    ),
  ).toEqual(['Kim', 'abc', true]);
});

test('only declared fields are read, typed by their declaration', () => {
  const read = readProfileFields(
    formOf([
      ['profile.crm:nickname', 'Lee'],
      ['profile.crm:age', '42'],
      ['profile.other:secret', 'x'],
      ['name', 'core'],
    ]),
    meta,
  );
  expect(read.values).toEqual({
    'crm:nickname': 'Lee',
    'crm:age': 42,
    'news:opt-in': false,
  });
  expect(read.invalid).toEqual([]);

  const blank = readProfileFields(
    formOf([
      ['profile.crm:age', ' '],
      ['profile.news:opt-in', 'on'],
    ]),
    meta,
  );
  expect(blank.values).toEqual({ 'crm:nickname': '', 'news:opt-in': true });

  const wrong = readProfileFields(formOf([['profile.crm:age', '1e999']]), meta);
  expect(wrong.invalid).toEqual(['crm:age']);
  expect(wrong.typed['crm:age']).toBe('1e999');
});

test('a refused save puts field issues next to fields and keeps the rest apart', () => {
  const refusal = profileFieldsRefusal({
    profileFields: true,
    message: 'Invalid input',
    code: 'invalid_input',
    issues: [
      { path: 'crm:age', message: 'Too big' },
      { path: 'crm:age', message: 'Second' },
      { path: '', message: 'Unknown field' },
      { nope: true },
    ],
    typed: { 'crm:age': '999', 'news:opt-in': true, bad: 1 },
  });
  expect(refusal?.typed).toEqual({ 'crm:age': '999', 'news:opt-in': true });
  expect(splitProfileIssues(refusal!.issues, meta)).toEqual({
    placed: { 'crm:age': 'Too big' },
    apart: [{ path: '', message: 'Unknown field' }],
  });
  // Another action's result is not a profile fields refusal.
  expect(profileFieldsRefusal({ message: 'x', issues: [] })).toBeNull();
  expect(profileFieldsRefusal({ notice: 'saved' })).toBeNull();
});

test('issues land on the field whose key is their path', () => {
  expect(profileIssueKey('crm:age', meta)).toBe('crm:age');
  expect(profileIssueKey('crm', meta)).toBeNull();
  expect(profileIssueKey('', meta)).toBeNull();
});
