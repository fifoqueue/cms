import { expect, test } from 'bun:test';
import { mediaStorageInputSchema } from '@cms/sdk';
import type { MediaResync } from '@cms/sdk';
import { Errors as SdkErrors } from '@cms/sdk/errors';
import {
  catalogMessage,
  errorMessage,
  issueText,
} from '#lib/admin/form-errors.js';
import { listQuery } from '#lib/admin/list-query.js';
import { readMediaFilter } from '#lib/admin/media-filter.js';
import { resyncActive, resyncSummary } from '#lib/admin/media-resync.js';
import {
  splitStorageIssues,
  storageFailureTitle,
} from '#lib/admin/settings/storage-drivers.js';
import { safeIssues } from '#lib/server/errors.js';
import { readMediaStorageForm } from '#lib/admin/settings/media-storage-form.server.js';
import { en, apiErrors as enErrors } from '#lib/i18n/en.js';
import { ko, apiErrors as koErrors } from '#lib/i18n/ko.js';

const formOf = (entries: Record<string, string>) => {
  const form = new FormData();
  for (const [name, value] of Object.entries(entries)) form.set(name, value);
  return form;
};

const s3Form = {
  driver: 's3',
  's3.endpoint': ' https://example.r2.cloudflarestorage.com ',
  's3.region': 'auto',
  's3.bucket': 'uploads',
  's3.accessKeyId': 'AKIA',
  's3.publicBaseUrl': '',
  's3.prefix': 'media/',
};

const drivers = [
  { id: 'local', label: 'Local filesystem', fields: [] },
  { id: 's3', label: 'S3-compatible', fields: [] },
  {
    id: 'plugin:vault:files',
    label: 'Vault',
    fields: [
      { key: 'zone', label: 'Zone', type: 'text' as const, required: true },
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

test('an empty S3 secret keeps the saved one; a typed one replaces it', () => {
  const kept = readMediaStorageForm(formOf(s3Form), drivers).input;
  expect(kept.s3).not.toBeNull();
  expect(kept.s3?.secretAccessKey).toBeUndefined();
  expect(kept.s3?.endpoint).toBe('https://example.r2.cloudflarestorage.com');
  // An empty public base URL is left out rather than sent as an invalid URL.
  expect(kept.s3 && 'publicBaseUrl' in kept.s3).toBe(false);
  expect(mediaStorageInputSchema.safeParse(kept).success).toBe(true);

  const { values, input } = readMediaStorageForm(
    formOf({
      ...s3Form,
      's3.secretAccessKey': 's3-secret',
      's3.forcePathStyle': 'on',
    }),
    drivers,
  );
  expect(input.s3?.secretAccessKey).toBe('s3-secret');
  expect(input.s3?.forcePathStyle).toBe(true);
  expect(JSON.stringify(values)).not.toContain('s3-secret');
});

test('other drivers send no S3 settings, so the saved ones are kept', () => {
  const { input } = readMediaStorageForm(
    formOf({ ...s3Form, driver: 'local', 's3.secretAccessKey': 's3-secret' }),
    drivers,
  );
  expect(input).toEqual({ driver: 'local', s3: null });
  expect(JSON.stringify(input)).not.toContain('s3-secret');
});

test('a plugin driver sends its fields; empty secrets keep, removed ones clear', () => {
  const { values, input } = readMediaStorageForm(
    formOf({
      driver: 'plugin:vault:files',
      'plugin.plugin:vault:files.zone': 'eu',
      'plugin.plugin:vault:files.token': '',
      'plugin.plugin:vault:files.signing': 'ignored',
      'plugin.plugin:vault:files.signing.remove': 'on',
    }),
    drivers,
  );
  expect(input).toEqual({
    driver: 'plugin:vault:files',
    s3: null,
    pluginSettings: { zone: 'eu', signing: '' },
  });
  expect(mediaStorageInputSchema.safeParse(input).success).toBe(true);
  expect(values.plugin).toEqual({
    id: 'plugin:vault:files',
    values: { zone: 'eu' },
  });

  const replaced = readMediaStorageForm(
    formOf({
      driver: 'plugin:vault:files',
      'plugin.plugin:vault:files.zone': 'eu',
      'plugin.plugin:vault:files.token': 'plugin-secret',
    }),
    drivers,
  );
  expect(replaced.input.pluginSettings).toEqual({
    zone: 'eu',
    token: 'plugin-secret',
  });
  expect(JSON.stringify(replaced.values)).not.toContain('plugin-secret');
});

test('every media storage message has text in both catalogs', () => {
  const storageErrors = Object.entries(SdkErrors).filter(
    ([name, message]) =>
      typeof message === 'string' &&
      (name.startsWith('MediaStorage') || name === 'MediaDriverInvalid'),
  ) as [keyof typeof koErrors, string][];
  expect(storageErrors.length).toBeGreaterThanOrEqual(11);
  for (const [key, message] of storageErrors) {
    expect(catalogMessage(en, message)).toBe(en.apiError(key));
    expect(catalogMessage(ko, message)).toBe(ko.apiError(key));
  }
});

test('a failed connection check reads its reason, not a generic error', () => {
  const refusal = (message: string, code = 'invalid_input') => ({
    message,
    code,
  });
  expect(errorMessage(ko, 'ko', refusal(SdkErrors.MediaStorageProbeAuth))).toBe(
    koErrors.MediaStorageProbeAuth as string,
  );
  expect(
    errorMessage(ko, 'ko', refusal(SdkErrors.MediaStorageProbeBucket)),
  ).toBe(koErrors.MediaStorageProbeBucket as string);
  expect(errorMessage(en, 'en', refusal(SdkErrors.MediaStorageProbeTls))).toBe(
    enErrors.MediaStorageProbeTls as string,
  );
  expect(errorMessage(ko, 'ko', refusal(SdkErrors.MediaStorageLocation))).toBe(
    koErrors.MediaStorageLocation as string,
  );
  // An outbound access denial keeps the egress message.
  expect(
    errorMessage(
      ko,
      'ko',
      refusal('Blocked destination', 'destination_blocked'),
    ),
  ).toBe(ko.destinationBlocked);
  expect(issueText(ko, 'ko', SdkErrors.MediaStorageFieldRequired)).toBe(
    koErrors.MediaStorageFieldRequired as string,
  );
});

test('plugin field issues land under the submitted driver’s fields', () => {
  const issues = [
    {
      path: 'pluginSettings.zone',
      message: SdkErrors.MediaStorageFieldRequired,
    },
    { path: 'pluginSettings.zone', message: 'second' },
    { path: 's3.bucket', message: 'bad bucket' },
    { path: 'pluginSettings.other', message: 'unknown field' },
    { path: 'driver', message: 'bad driver' },
  ];
  expect(splitStorageIssues(issues, 'plugin:vault:files', drivers)).toEqual({
    fields: {
      'pluginSettings.zone': SdkErrors.MediaStorageFieldRequired,
      's3.bucket': 'bad bucket',
    },
    rest: [
      { path: 'pluginSettings.other', message: 'unknown field' },
      { path: 'driver', message: 'bad driver' },
    ],
  });
  // On another driver, plugin paths are not any input's.
  expect(splitStorageIssues(issues, 'local', drivers).rest).toHaveLength(4);
});

test('the missing filter reaches the list query and stays in filter and page links', () => {
  const { filter, query } = readMediaFilter(
    new URLSearchParams('missing=1&kind=image&view=list'),
  );
  expect(query).toEqual({
    kind: 'image',
    search: undefined,
    month: undefined,
    unattached: undefined,
    missing: 'true',
  });
  const link = (changes: Record<string, string | number | undefined>) =>
    new URLSearchParams(listQuery({ ...filter, page: 2 }, changes).slice(1));
  expect(link({ kind: undefined, page: 1 }).get('missing')).toBe('1');
  expect(link({ page: 3 }).get('missing')).toBe('1');
  expect(link({ view: undefined }).get('missing')).toBe('1');
  // The chip turns the filter off again.
  expect(link({ missing: undefined, page: 1 }).has('missing')).toBe(false);
  expect(
    readMediaFilter(new URLSearchParams('missing=true')).query.missing,
  ).toBeUndefined();
});

const job = (status: MediaResync['status'], error: string | null = null) => ({
  id: 'job-1',
  status,
  driver: 's3',
  startedAt: '2026-01-01T00:00:00.000Z',
  finishedAt: status === 'queued' || status === 'running' ? null : 'done',
  scanned: 10,
  refreshed: 2,
  missing: 1,
  untracked: 3,
  error,
  cleanupNeedsAttention: 0,
});

test('a test file left behind names its bucket and key as plain text', () => {
  const issues = safeIssues([
    {
      path: 'probe',
      message: SdkErrors.MediaStorageProbeCleanup,
      params: { bucket: 'media', key: '<b>probe</b>.txt', extra: 'dropped' },
    },
    { path: 's3.bucket', message: 'bad bucket', received: 'dropped' },
  ]);
  expect(issues).toEqual([
    {
      path: 'probe',
      message: SdkErrors.MediaStorageProbeCleanup,
      params: { bucket: 'media', key: '<b>probe</b>.txt' },
    },
    { path: 's3.bucket', message: 'bad bucket' },
  ]);
  const failure = {
    message: SdkErrors.MediaStorageProbeCleanup,
    code: 'invalid_input',
    issues,
  };
  expect(storageFailureTitle(ko, 'ko', failure)).toBe(
    '연결 확인용 파일을 지우지 못했습니다. 저장소에서 직접 삭제하세요: media/<b>probe</b>.txt',
  );
  expect(storageFailureTitle(en, 'en', failure)).toBe(
    'The connection test file could not be removed. Delete media/<b>probe</b>.txt from the storage yourself.',
  );
  // Without the location, the generic text; the probe issue is not listed as a field line.
  expect(storageFailureTitle(ko, 'ko', { ...failure, issues: undefined })).toBe(
    '연결 확인용 파일을 지우지 못했습니다. 저장소에 남은 확인용 파일을 직접 삭제하세요.',
  );
  expect(splitStorageIssues(issues!, 's3', drivers).rest).toEqual([]);
  // Other refusals keep their catalog text.
  expect(
    storageFailureTitle(ko, 'ko', {
      message: SdkErrors.MediaStorageProbeAuth,
      code: 'invalid_input',
    }),
  ).toBe(koErrors.MediaStorageProbeAuth as string);
});

test('a resync with files it could not clean up says how many need checking', () => {
  const when = (iso: string) => iso;
  const leftover = { ...job('completed'), cleanupNeedsAttention: 2 };
  expect(resyncSummary(ko, 'ko', leftover, when)?.attention).toBe(
    '정리하지 못한 파일 2개는 확인이 필요합니다.',
  );
  expect(
    resyncSummary(
      en,
      'en',
      { ...job('failed'), cleanupNeedsAttention: 1 },
      when,
    )?.attention,
  ).toBe('Files that could not be cleaned up and need checking: 1.');
  expect(resyncSummary(ko, 'ko', job('completed'), when)).not.toHaveProperty(
    'attention',
  );
});

test('resync status: waiting and running keep polling, finished jobs show results', () => {
  expect(resyncActive(null)).toBe(false);
  expect(resyncActive(job('queued'))).toBe(true);
  expect(resyncActive(job('running'))).toBe(true);
  expect(resyncActive(job('completed'))).toBe(false);
  expect(resyncActive(job('failed'))).toBe(false);

  const when = (iso: string) => iso;
  expect(resyncSummary(ko, 'ko', null, when)).toBeNull();
  expect(resyncSummary(ko, 'ko', job('running'), when)).toEqual({
    tone: 'progress',
    title: ko.mediaResyncRunning,
    counts: [],
  });
  expect(resyncSummary(ko, 'ko', job('completed'), when)).toEqual({
    tone: 'done',
    title: ko.mediaResyncCompleted('done'),
    counts: [
      { label: ko.mediaResyncScanned, value: 10 },
      { label: ko.mediaResyncRefreshed, value: 2 },
      { label: ko.mediaResyncMissing, value: 1 },
      { label: ko.mediaResyncUntracked, value: 3 },
    ],
  });
  // The API's (English) reason reaches English readers only.
  const failed = job('failed', 'Storage resync failed');
  expect(resyncSummary(ko, 'ko', failed, when)?.detail).toBeUndefined();
  expect(resyncSummary(en, 'en', failed, when)).toEqual({
    tone: 'failed',
    title: en.mediaResyncFailed('done'),
    counts: [],
    detail: 'Storage resync failed',
  });
});
