import {
  SIGN_IN_MESSAGES,
  SSO_MESSAGES,
  VISITOR_MESSAGES,
} from '#lib/admin/sso-messages.js';
import type { Messages } from '#lib/i18n/index.js';

/**
 * Catalog keys for specific messages of the SDK `Errors` catalog, whether the API refuses with
 * one or reports it as a field issue. More precise than the error code, so they win.
 */
const MESSAGES: Record<string, keyof Messages> = {
  ...SSO_MESSAGES,
  ...SIGN_IN_MESSAGES,
  ...VISITOR_MESSAGES,
};

/** Catalog keys for the API's error codes. */
const CODES: Record<string, keyof Messages> = {
  invalid_input: 'errorInvalidInput',
  unauthorized: 'errorUnauthorized',
  forbidden: 'errorForbidden',
  not_found: 'errorNotFound',
  conflict: 'errorConflict',
  rate_limited: 'errorRateLimited',
  payload_too_large: 'errorTooLarge',
  captcha_required: 'errorCaptchaRequired',
  destination_blocked: 'destinationBlocked',
};

/** Catalog keys for the first segment of an issue path (`seo.title` → SEO). */
const FIELDS: Record<string, keyof Messages> = {
  title: 'fieldTitle',
  slug: 'fieldSlug',
  excerpt: 'fieldExcerpt',
  document: 'fieldBody',
  status: 'fieldStatus',
  type: 'fieldType',
  publishedAt: 'fieldPublishAt',
  password: 'fieldPassword',
  authorId: 'fieldAuthor',
  defaultName: 'discussionDefaultName',
  featuredMediaId: 'featuredImage',
  categoryIds: 'columnCategories',
  tagIds: 'columnTags',
  parentId: 'parentPage',
  name: 'name',
  email: 'email',
  role: 'role',
  alt: 'mediaAlt',
  caption: 'mediaCaption',
  seo: 'seoTabs',
};

const text = (m: Messages, key: keyof Messages | undefined) => {
  const value = key && m[key];
  return typeof value === 'string' ? value : undefined;
};

export interface FormError {
  message?: string;
  code?: string;
  issues?: { path: string; message: string }[];
}

/**
 * What a failed action shows. English readers get the server's own (more specific) text; other
 * languages get catalog text by error code, so no untranslated English reaches them.
 */
export const errorMessage = (m: Messages, language: string, error: FormError) =>
  text(m, error.message ? MESSAGES[error.message] : undefined) ??
  (language === 'en' && error.message
    ? error.message
    : (text(m, error.code ? CODES[error.code] : undefined) ??
      (error.issues?.length ? m.errorInvalidInput : m.errorGeneric)));

/** A field issue's message in the reader's language: catalog text when known. */
export const issueText = (m: Messages, language: string, message: string) =>
  text(m, MESSAGES[message]) ??
  (language === 'en' ? message : m.errorFieldInvalid);

/** One line per field issue, with the field's label instead of its path. */
export const issueLines = (
  m: Messages,
  language: string,
  issues: { path: string; message: string }[],
) =>
  issues.map(({ path, message }) => {
    const label = text(m, FIELDS[path.split('.')[0] ?? '']);
    const detail = issueText(m, language, message);
    return label
      ? `${label}: ${detail}`
      : language === 'en' && path
        ? `${path}: ${detail}`
        : detail;
  });
