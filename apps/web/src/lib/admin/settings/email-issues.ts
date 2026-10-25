import { issueText } from '#lib/admin/form-errors.js';
import type { Messages } from '#lib/i18n/index.js';

/** A field issue of the email settings form in the reader's language. */
export const emailIssueText = (
  m: Messages,
  language: string,
  { message }: { message: string },
) => issueText(m, language, message);
