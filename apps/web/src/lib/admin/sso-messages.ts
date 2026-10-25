import { Errors as SdkErrors } from '@cms/sdk/errors';

/** Refusals that a fresh interactive sign-in resolves; the screen offers to sign in again. */
export const RECENT_SIGN_IN_MESSAGES: readonly string[] = [
  SdkErrors.RecentSignInRequired,
  SdkErrors.RecoveryRecentSignIn,
  SdkErrors.SsoLinkSignInRequired,
];
