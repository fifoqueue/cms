import { Errors as SdkErrors } from '@cms/sdk/errors';
import { Errors as WebErrors } from '#lib/errors.js';
import type {
  ApiErrorKey,
  ApiErrorParams,
  WebErrorKey,
} from '#lib/i18n/api-errors.js';
import type { Messages } from '#lib/i18n/index.js';

type Entry = { web: false; key: ApiErrorKey } | { web: true; key: WebErrorKey };

/**
 * Message text → its key in the SDK or web `Errors` catalog, the reverse of both. Every text is
 * unique (tested); the SDK's would win for text both shared.
 */
const KEYS = new Map<string, Entry>();
for (const key of Object.keys(SdkErrors) as ApiErrorKey[])
  KEYS.set(SdkErrors[key], { web: false, key });
for (const key of Object.keys(WebErrors) as WebErrorKey[])
  if (!KEYS.has(WebErrors[key])) KEYS.set(WebErrors[key], { web: true, key });

/**
 * Catalog text for a known message in `m`'s language with the values it reported; a value that
 * is itself a known message (`PermalinkPathInvalid`'s `reason`) reads in that language too.
 */
const localized = (
  m: Messages,
  message: string,
  params?: ApiErrorParams,
): string | undefined => {
  const entry = KEYS.get(message);
  if (!entry) return undefined;
  const values =
    params &&
    Object.fromEntries(
      Object.entries(params).map(([name, value]) => [
        name,
        (typeof value === 'string' && localized(m, value)) || value,
      ]),
    );
  return entry.web
    ? m.webError(entry.key, values)
    : m.apiError(entry.key, values);
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
  issues?: {
    path: string;
    message: string;
    params?: ApiErrorParams;
  }[];
}

/** An issue with an empty path carries the refusal's own values. */
const ownIssue = (issue: { path: string; message: string }, message: string) =>
  issue.path === '' && issue.message === message;

/**
 * What a failed action shows: catalog text for a known message (params from its own issue, else
 * from an issue reporting the same message). Otherwise English readers get the server's own (more
 * specific) text; other languages get catalog text by error code, so no untranslated English
 * reaches them.
 */
export const errorMessage = (m: Messages, language: string, error: FormError) =>
  (error.message
    ? localized(
        m,
        error.message,
        (
          error.issues?.find((issue) => ownIssue(issue, error.message!)) ??
          error.issues?.find(({ message }) => message === error.message)
        )?.params,
      )
    : undefined) ??
  (language === 'en' && error.message
    ? error.message
    : (text(m, error.code ? CODES[error.code] : undefined) ??
      (error.issues?.length ? m.errorInvalidInput : m.errorGeneric)));

/** Catalog text for a known API or web message, in any language; `undefined` for others. */
export const catalogMessage = (
  m: Messages,
  message: string,
  params?: ApiErrorParams,
) => localized(m, message, params);

/**
 * A status line (a site-health `detail` entry) in the reader's language: a catalog note
 * (`{ message, params }`) or a string holding a known message; other text as given.
 */
export const statusLine = (
  m: Messages,
  line: string | { message: string; params?: ApiErrorParams },
) => {
  const { message, params } =
    typeof line === 'string' ? { message: line, params: undefined } : line;
  return localized(m, message, params) ?? message;
};

/** A field issue's message in the reader's language: catalog text when known. */
export const issueText = (
  m: Messages,
  language: string,
  message: string,
  params?: ApiErrorParams,
) =>
  localized(m, message, params) ??
  (language === 'en' ? message : m.errorFieldInvalid);

/**
 * One line per field issue, with the field's label instead of its path. The refusal's own issue
 * (empty path, same message as `refusal`) is its headline's values, not a line.
 */
export const issueLines = (
  m: Messages,
  language: string,
  issues: { path: string; message: string; params?: ApiErrorParams }[],
  refusal?: string,
) =>
  issues
    .filter((issue) => refusal === undefined || !ownIssue(issue, refusal))
    .map(({ path, message, params }) => {
      const label = text(m, FIELDS[path.split('.')[0] ?? '']);
      const detail = issueText(m, language, message, params);
      return label
        ? `${label}: ${detail}`
        : language === 'en' && path
          ? `${path}: ${detail}`
          : detail;
    });
