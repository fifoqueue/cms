import { Errors as SdkErrors } from '@cms/sdk/errors';
import type { Messages } from '#lib/i18n/index.js';

/**
 * Catalog keys for the email settings messages of the SDK `Errors` catalog, which both the
 * shared schema and the API (`http.secret`) report as issue messages.
 */
export const EMAIL_ISSUE_MESSAGES: Record<string, keyof Messages> = {
  [SdkErrors.EmailServerRequired]: 'emailServerRequired',
  [SdkErrors.EmailSenderRequired]: 'emailSenderRequired',
  [SdkErrors.EmailSecretRequired]: 'emailSecretRequired',
  [SdkErrors.EmailProviderFieldRequired]: 'emailProviderFieldRequired',
  [SdkErrors.EmailRegionInvalid]: 'emailRegionInvalid',
  [SdkErrors.EmailUrlInvalid]: 'emailUrlInvalid',
  [SdkErrors.EmailHeaderInvalid]: 'emailHeaderInvalid',
  [SdkErrors.EmailTemplateInvalid]: 'emailTemplateInvalid',
};

/** A field issue of the email settings form in the reader's language. */
export const emailIssueText = (
  m: Messages,
  language: string,
  { message }: { message: string },
) => {
  const key = EMAIL_ISSUE_MESSAGES[message];
  const text = key && m[key];
  if (typeof text === 'string') return text;
  return language === 'en' ? message : m.errorFieldInvalid;
};
