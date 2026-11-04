import { messagesFor } from '#lib/i18n/index.js';
import type { ApiErrorKey, WebErrorKey } from '#lib/i18n/api-errors.js';
import { translationManifest } from '@cms/sdk/i18n-manifest';
import { LOOKUP_KEYS, pickOverrides } from '#lib/i18n/overrides.js';
import type { Overrides } from '#lib/i18n/overrides.js';
import { SITE_STRINGS } from '#lib/i18n/site.js';
import type { SiteCatalog, SiteStrings } from '#lib/i18n/site.js';

const SITE_KEYS: ReadonlySet<string> = new Set(
  Object.keys(translationManifest.site).filter((key) => !LOOKUP_KEYS.has(key)),
);

const API_ERRORS = [
  'InvalidCredentials',
  'SecondFactorFailed',
  'InvalidInput',
  'RequestBodyNotJson',
  'RequestBodyTooLarge',
  'Internal',
  'AuthenticationRequired',
  'Forbidden',
  'TooManyAttempts',
  'CaptchaRequired',
  'CaptchaInvalid',
  'PasswordResetLimit',
  'PasswordTokenInvalid',
  'SignInExpired',
  'SignInStepRequired',
  'SignInAccessRequired',
  'PasswordLoginDisabled',
  'SsoRequestExpired',
  'SsoNotFound',
  'SsoRateLimited',
  'SsoPendingLimit',
  'SsoAccountUnusable',
  'SsoAccountNotLinked',
  'SsoAccountUnlinked',
  'SsoFailed',
  'SsoClaimTokenRequired',
  'RegistrationClosed',
  'EmailRegistered',
  'InvalidResponse',
  'CommentUrlInvalid',
  'CommentEmailRequired',
  'CommentLoginRequired',
  'CommentNotFound',
  'CommentsClosed',
  'CommentReplyInvalid',
  'CommentUnsubscribeInvalid',
  'CommentPushEndpointInvalid',
  'CommentPushTokenInvalid',
  'ContentNotFound',
  'ContentPasswordWrong',
] as const satisfies readonly ApiErrorKey[];

const WEB_ERRORS = [
  'NotFound',
  'Forbidden',
  'InvalidContentPath',
  'FormInvalid',
  'PasswordMismatch',
  'SignInRedirectInvalid',
  'BulkItemFailed',
  'BulkItemInvalid',
  'ModerationInvalid',
] as const satisfies readonly WebErrorKey[];

/**
 * Only serializable, public copy leaves the server; administration remains server-only here.
 * Of `overrides`, only entries for public keys are kept.
 */
export const siteCatalog = (
  language: string,
  overrides: Overrides = {},
): SiteCatalog => {
  const m = messagesFor(language);

  return {
    language,
    strings: Object.fromEntries(
      SITE_STRINGS.map((key) => [key, m[key]]),
    ) as SiteStrings,
    apiErrors: Object.fromEntries(
      API_ERRORS.map((key) => [key, m.apiError(key)]),
    ),
    webErrors: Object.fromEntries(
      WEB_ERRORS.map((key) => [key, m.webError(key)]),
    ),
    overrides: pickOverrides(overrides, SITE_KEYS),
  };
};
