import { test } from 'node:test';
import { equal } from 'node:assert/strict';
import { Errors as SdkErrors } from '@cms/sdk/errors';
import { Errors as WebErrors } from '#lib/errors.js';
import { errorCopy } from '#lib/error-copy.js';
import { rootI18n } from '#lib/i18n/context.js';
import type { useI18n, useErrorI18n } from '#lib/i18n/context.js';
import type { useI18n as useAdminI18n } from '#lib/i18n/index.js';
import { messagesFor } from '#lib/i18n/admin.js';

type Assert<T extends true> = T;
export type PublicScope = Assert<
  Extract<
    'seoFocusKeyword' | 'fieldPublishAt' | 'fieldStatus' | 'seoTabs',
    keyof ReturnType<typeof useI18n>['m']
  > extends never
    ? true
    : false
>;
export type SharedErrorScope = Assert<
  'seoFocusKeyword' extends keyof ReturnType<typeof useErrorI18n>['m']
    ? false
    : true
>;
export type AdminScope = Assert<
  'seoFocusKeyword' extends keyof ReturnType<typeof useAdminI18n>['m']
    ? true
    : false
>;

test('root authentication errors keep their translated help and unknown errors use the fallback', () => {
  const m = rootI18n.m;
  const full = messagesFor('en');
  equal(
    errorCopy(m, 401, SdkErrors.AuthenticationRequired).help,
    full.apiError('AuthenticationRequired'),
  );
  equal(
    errorCopy(m, 403, SdkErrors.Forbidden).help,
    full.apiError('Forbidden'),
  );
  equal(
    errorCopy(m, 403, WebErrors.Forbidden).help,
    full.webError('Forbidden'),
  );
  for (const status of [401, 403])
    equal(
      errorCopy(m, status, 'unrecognized error').help,
      m.errorPageForbiddenHelp,
    );
});
