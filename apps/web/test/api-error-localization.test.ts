import { expect, test } from 'bun:test';
import { Errors } from '@cms/sdk/errors';
import {
  catalogMessage,
  errorMessage,
  issueLines,
  issueText,
} from '#lib/admin/form-errors.js';
import { Errors as WebErrors } from '#lib/errors.js';
import type { ApiErrorKey, WebErrorKey } from '#lib/i18n/api-errors.js';
import {
  apiErrors as enErrors,
  en,
  webErrors as enWebErrors,
} from '#lib/i18n/en.js';
import {
  apiErrors as koErrors,
  ko,
  webErrors as koWebErrors,
} from '#lib/i18n/ko.js';
import { resyncSummary } from '#lib/admin/media-resync.js';
import { statusLine } from '#lib/admin/form-errors.js';

const webKeys = Object.keys(WebErrors) as WebErrorKey[];

const keys = Object.keys(Errors) as ApiErrorKey[];

/** A value for every param the SDK comments name. */
const sample = {
  bucket: 'media',
  key: 'probe.txt',
  parents: 'core/group',
  parent: 'core/list',
  max: 120,
  min: 1,
  options: 'left, right',
  role: 'base',
  slug: 'hello',
  maxBytes: 10485760,
  limit: 50,
  count: 3,
  type: 'attachment',
  status: 'inherit',
  detail: 'Unknown node',
  path: '/hello',
  title: 'Hello',
  reason: 'Path is reserved',
  file: 'templates/x.json',
  id: 'acme',
  range: '^2.0.0',
  version: '1.4.0',
  check: 'plugin:acme:disk',
  kind: 'webhook.deliver',
};

test('every SDK error has text in both languages, with and without its params', () => {
  for (const key of keys)
    for (const m of [en, ko])
      for (const text of [m.apiError(key), m.apiError(key, sample)]) {
        expect(text.trim()).not.toBe('');
        expect(text).not.toContain('undefined');
      }
  // Same keys in both tables.
  expect(Object.keys(koErrors).sort()).toEqual([...keys].sort());
  expect(Object.keys(enErrors).sort()).toEqual([...keys].sort());
});

test('every web server error has text in both languages, with and without its params', () => {
  for (const key of webKeys)
    for (const m of [en, ko])
      for (const text of [m.webError(key), m.webError(key, sample)]) {
        expect(text.trim()).not.toBe('');
        expect(text).not.toContain('undefined');
      }
  expect(Object.keys(koWebErrors).sort()).toEqual([...webKeys].sort());
  expect(Object.keys(enWebErrors).sort()).toEqual([...webKeys].sort());
});

test('each SDK and web message reads as its own key', () => {
  const texts = [...Object.values(Errors), ...Object.values(WebErrors)];
  // No messages share text, across both catalogs; a web message meaning the same as an SDK one
  // uses the SDK one.
  expect(new Set(texts).size).toBe(texts.length);
  for (const key of keys) {
    expect(catalogMessage(ko, Errors[key])).toBe(ko.apiError(key));
    expect(catalogMessage(en, Errors[key])).toBe(en.apiError(key));
  }
  for (const key of webKeys) {
    expect(catalogMessage(ko, WebErrors[key])).toBe(ko.webError(key));
    expect(catalogMessage(en, WebErrors[key])).toBe(en.webError(key));
  }
});

test('web refusals read in the reader language, with their own values', () => {
  const refusal = {
    message: WebErrors.BulkTooMany,
    issues: [
      { path: '', message: WebErrors.BulkTooMany, params: { limit: 100 } },
    ],
  };
  expect(errorMessage(ko, 'ko', refusal)).toBe(
    '한 번에 최대 100개까지 선택할 수 있습니다. 아무것도 바뀌지 않았습니다.',
  );
  expect(errorMessage(en, 'en', refusal)).toBe(
    'Select at most 100 items at a time; nothing was changed.',
  );
  // The refusal's own issue is not listed as a field line.
  expect(issueLines(ko, 'ko', refusal.issues, refusal.message)).toEqual([]);
  expect(errorMessage(ko, 'ko', { message: WebErrors.PasswordMismatch })).toBe(
    '비밀번호가 일치하지 않습니다.',
  );
});

test('status fields that hold SDK messages read in the reader language', () => {
  expect(
    statusLine(ko, {
      message: Errors.HealthJobFailed,
      params: { kind: 'webhook.deliver' },
    }),
  ).toBe('백그라운드 작업(webhook.deliver)이 실패했습니다.');
  expect(
    statusLine(en, {
      message: Errors.SearchRequestFailed,
      params: { status: 503 },
    }),
  ).toBe('Meilisearch answered with an error (HTTP 503)');
  expect(statusLine(ko, { message: 'unknown note' })).toBe('unknown note');
  const sendFailed = (params: Record<string, string | number>) => ({
    message: Errors.EmailSendFailed,
    issues: [{ path: '', message: Errors.EmailSendFailed, params }],
  });
  expect(errorMessage(ko, 'ko', sendFailed({ reason: 'auth' }))).toBe(
    '메일 서버가 사용자 이름, 비밀번호 또는 API 키를 받아들이지 않았습니다.',
  );
  expect(
    errorMessage(en, 'en', sendFailed({ reason: 'rejected', status: 422 })),
  ).toBe(
    'The mail server refused the message. Check the server log for details. (HTTP 422)',
  );
  expect(statusLine(ko, Errors.SearchUnavailable)).toBe(
    'Meilisearch가 응답하지 않습니다.',
  );
  expect(statusLine(ko, 'queue: 3 waiting')).toBe('queue: 3 waiting');
  const failed = {
    id: 'job-1',
    status: 'failed' as const,
    driver: 's3',
    startedAt: '2026-01-01T00:00:00.000Z',
    finishedAt: 'done',
    scanned: 0,
    refreshed: 0,
    missing: 0,
    untracked: 0,
    error: Errors.MediaResyncFailed,
    cleanupNeedsAttention: 0,
  };
  expect(resyncSummary(ko, 'ko', failed, (iso) => iso)?.detail).toBe(
    ko.apiError('MediaResyncFailed'),
  );
  // Import skips and plugin errors render their params.
  expect(
    catalogMessage(en, Errors.ImportItemUnsupported, {
      type: 'attachment',
      status: 'inherit',
    }),
  ).toBe('Not imported: attachment (inherit) is not supported');
  expect(
    catalogMessage(ko, Errors.PluginRequiresCms, {
      range: '^2.0.0',
      version: '1.4.0',
    }),
  ).toBe(
    '이 플러그인은 CMS ^2.0.0 버전이 필요합니다. 이 사이트는 1.4.0 버전입니다.',
  );
});

test('email-disabled refusals explain the required setup in the reader language', () => {
  const refusal = { code: 'invalid_input', message: Errors.EmailDisabled };
  expect(errorMessage(ko, 'ko', refusal)).toBe(
    '먼저 메일 발송을 설정하고 활성화하세요.',
  );
  expect(errorMessage(en, 'en', refusal)).toBe(Errors.EmailDisabled);
  expect(issueText(ko, 'ko', Errors.EmailDisabled)).toBe(
    koErrors.EmailDisabled as string,
  );
  expect(catalogMessage(ko, Errors.EmailDisabled)).toBe(
    koErrors.EmailDisabled as string,
  );
});

test('messages naming values render the reported params in the reader language', () => {
  expect(issueText(ko, 'ko', Errors.BlockAttrNumber, { min: 1, max: 6 })).toBe(
    '1~6 사이의 정수여야 합니다.',
  );
  expect(issueText(en, 'en', Errors.BlockAttrNumber, { min: 1, max: 6 })).toBe(
    'Must be a whole number from 1 to 6',
  );
  // Without them the text still reads.
  expect(issueText(ko, 'ko', Errors.BlockAttrNumber)).toBe(
    '허용 범위 안의 정수여야 합니다.',
  );
  // Korean keeps the reported detail too, and values never sit before a guessed particle.
  expect(
    issueText(ko, 'ko', Errors.InvalidDocument, { detail: 'heading.level' }),
  ).toBe('문서가 올바르지 않습니다: heading.level');
  expect(
    issueText(ko, 'ko', Errors.ThemeColorUnknown, { slug: 'accent-2' }),
  ).toBe('테마 팔레트에 없는 색상입니다: “accent-2”');
  expect(issueText(en, 'en', Errors.BlockAttrNumber)).toBe(
    Errors.BlockAttrNumber,
  );
  // A refusal takes the params of its own issue.
  const refusal = {
    code: 'conflict',
    message: Errors.SlugInUse,
    issues: [
      { path: 'slug', message: Errors.SlugInUse, params: { slug: 'hello' } },
    ],
  };
  expect(errorMessage(ko, 'ko', refusal)).toBe(
    '“hello” 슬러그는 이미 사용 중입니다.',
  );
  // A param that is itself an SDK message reads in the same language.
  expect(
    issueText(ko, 'ko', Errors.PermalinkPathInvalid, {
      reason: Errors.PermalinkPathReserved,
      path: '/admin',
    }),
  ).toBe('이 주소(/admin)는 이 항목에 쓸 수 없습니다. 예약된 경로입니다.');
  expect(issueText(ko, 'ko', 'Invalid input: expected string')).toBe(
    ko.errorFieldInvalid,
  );
});

test('field lines keep their labels and read known messages', () => {
  expect(
    issueLines(ko, 'ko', [
      { path: 'title', message: Errors.BlockAttrRequired },
      { path: 'extra.key', message: 'Odd value' },
    ]),
  ).toEqual([`${ko.fieldTitle}: 필수 항목입니다.`, ko.errorFieldInvalid]);
  expect(
    issueLines(ko, 'ko', [
      {
        path: 'title',
        message: Errors.BlockAttrTooLong,
        params: { max: 40 },
      },
    ]),
  ).toEqual([`${ko.fieldTitle}: 최대 40자까지 입력할 수 있습니다.`]);
  expect(
    issueLines(en, 'en', [{ path: 'extra.key', message: 'Odd value' }]),
  ).toEqual(['extra.key: Odd value']);
});
