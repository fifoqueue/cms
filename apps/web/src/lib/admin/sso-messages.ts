import { Errors as SdkErrors } from '@cms/sdk/errors';
import type { Messages } from '#lib/i18n/index.js';

/**
 * Catalog keys for the single sign-on messages of the SDK `Errors` catalog: the shared schema's
 * field issues and the API's refusals, which report the same text.
 */
export const SSO_MESSAGES: Record<string, keyof Messages> = {
  [SdkErrors.SsoProviderIdInvalid]: 'ssoProviderIdInvalid',
  [SdkErrors.SsoProviderIdDuplicate]: 'ssoProviderIdDuplicate',
  [SdkErrors.SsoIssuerRequired]: 'ssoIssuerRequired',
  [SdkErrors.SsoIssuerInvalid]: 'ssoIssuerInvalid',
  [SdkErrors.SsoScopesOpenid]: 'ssoScopesOpenid',
  [SdkErrors.SsoClaimTokenRequired]: 'ssoClaimTokenRequired',
  [SdkErrors.PasswordLoginDisabled]: 'ssoPasswordLoginDisabled',
  [SdkErrors.SsoProviderRequired]: 'ssoProviderRequired',
  [SdkErrors.SsoAccessRequired]: 'ssoAccessRequired',
  [SdkErrors.SsoLastAccess]: 'ssoLastAccess',
};

/** Catalog keys for the sign-in messages of the SDK `Errors` catalog (Settings → Sign-in). */
export const SIGN_IN_MESSAGES: Record<string, keyof Messages> = {
  [SdkErrors.SignInDuplicate]: 'signInDuplicate',
  [SdkErrors.SignInMethodRequired]: 'signInMethodRequired',
  [SdkErrors.SignInUnknown]: 'signInUnknown',
  [SdkErrors.SignInAccessRequired]: 'signInAccessRequired',
  [SdkErrors.SignInLastFactor]: 'signInLastFactor',
  [SdkErrors.SignInExpired]: 'signInExpired',
  [SdkErrors.RecoveryRecentSignIn]: 'recoveryRecentSignIn',
  [SdkErrors.SignInFactorRequired]: 'signInFactorRequired',
  [SdkErrors.RecentSignInRequired]: 'recentSignInRequired',
  [SdkErrors.InvalidCredentials]: 'signInInvalidCredentials',
  [SdkErrors.SecondFactorFailed]: 'signInSecondFactorFailed',
};

/** Catalog keys for what the API tells visitors on sign-in, link and protection screens. */
export const VISITOR_MESSAGES: Record<string, keyof Messages> = {
  [SdkErrors.AuthenticationRequired]: 'authRequired',
  [SdkErrors.TooManyAttempts]: 'authTooManyAttempts',
  [SdkErrors.CaptchaRequired]: 'authCaptchaRequired',
  [SdkErrors.CaptchaInvalid]: 'authCaptchaInvalid',
  [SdkErrors.PasswordResetLimit]: 'authPasswordResetLimit',
  [SdkErrors.PasswordTokenInvalid]: 'authPasswordTokenInvalid',
  [SdkErrors.CurrentPasswordWrong]: 'authCurrentPasswordWrong',
  [SdkErrors.SsoRateLimited]: 'authSsoRateLimited',
  [SdkErrors.SsoPendingLimit]: 'authSsoPendingLimit',
  [SdkErrors.SsoRequestExpired]: 'authSsoRequestExpired',
  [SdkErrors.SsoLinkSignInRequired]: 'authSsoLinkSignInRequired',
  [SdkErrors.SsoAccountUnusable]: 'authSsoAccountUnusable',
  [SdkErrors.SsoAccountAssigned]: 'authSsoAccountAssigned',
  [SdkErrors.SsoAccountNotLinked]: 'authSsoAccountNotLinked',
  [SdkErrors.SsoAccountUnlinked]: 'authSsoAccountUnlinked',
  [SdkErrors.SsoFailed]: 'authSsoFailed',
  [SdkErrors.SsoAccountLinkedElsewhere]: 'authSsoAccountLinkedElsewhere',
};

/** Refusals that a fresh interactive sign-in resolves; the screen offers to sign in again. */
export const RECENT_SIGN_IN_MESSAGES: readonly string[] = [
  SdkErrors.RecentSignInRequired,
  SdkErrors.RecoveryRecentSignIn,
  SdkErrors.SsoLinkSignInRequired,
];
