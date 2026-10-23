import { error, fail } from '@sveltejs/kit';
import { CAPTCHA_REQUIRED, formIssuesSchema } from '@cms/sdk';
import { CmsApiError } from '@cms/sdk/client';

/** Every error message the web server throws; see `Errors` in the API for the rule. */
export const Errors = {
  ThemeQueriesLimit: 'A theme can contain at most 32 independent post lists.',
  NotFound: 'Not found',
  Forbidden: 'You do not have permission to view this page',
  InvalidContentPath: 'Invalid content path',
  SitemapIndexTooLarge: (limit: number) =>
    `Sitemap index would exceed ${limit} sitemaps`,
  FormInvalid: 'Please fix the fields below',
  PermalinkPatternsInvalid: 'Please fix the permalink patterns',
  PasswordMismatch: 'Passwords do not match.',
  SsoRequestExpired: 'The sign-in request has expired. Please try again.',
  PluginBundleRequired: 'Choose a plugin bundle (.js)',
  ImportFileRequired: 'Choose a WordPress export file (.xml)',
  PluginNotFound: 'Plugin not found',
  ThemeFileRequired: 'Choose a theme archive (.zip)',
  BlocksInvalid: 'The blocks could not be read',
  TemplateNameInvalid: 'Use lowercase letters, numbers and dashes for the slug',
  ThemeFileTooLarge: 'Theme archives can be at most 2 MB',
  BulkItemFailed: 'This item could not be changed. Try again later.',
  BulkItemInvalid: 'This selection is not valid.',
  BulkTooMany: (limit: number) =>
    `Select at most ${limit} items at a time; nothing was changed.`,
  PluginActivationFailed: 'The plugin could not be activated.',
  ReassignToDeleted:
    'Choose someone who is not being deleted to receive the content.',
  PasswordOrInvite: 'Enter a password or send an invitation.',
} as const;

export interface FormIssue {
  path: string;
  message: string;
}

export interface FormFailure {
  message: string;
  /** The API's error code, so the screen can show catalog text in the reader's language. */
  code?: string;
  issues?: FormIssue[];
  /** The API wants a solved captcha before it accepts the attempt. */
  captcha?: boolean;
}

/**
 * Field issues reduced to `{ path, message }` strings. Anything else an error body carries
 * (received values, codes, nested data) never reaches page data.
 */
export const safeIssues = (issues: unknown): FormIssue[] | undefined => {
  const parsed = formIssuesSchema.safeParse(issues);
  return parsed.success
    ? parsed.data.map(({ path, message }) => ({ path, message }))
    : undefined;
};

/**
 * Turns API client errors (4xx) into a form failure. Anything else is rethrown. `extra` is
 * echoed back to the form (e.g. what the user typed) and must only hold fields safe to show.
 */
export const failFrom = <Extra extends object = Record<never, never>>(
  caught: unknown,
  extra?: Extra,
) => {
  if (caught instanceof CmsApiError && caught.status < 500) {
    const failure: FormFailure = {
      message: caught.message,
      code: caught.code,
      issues: safeIssues(caught.issues),
      ...(caught.code === CAPTCHA_REQUIRED && { captcha: true }),
    };
    return fail(caught.status, { ...extra, ...failure } as Extra & FormFailure);
  }
  throw caught;
};

/** Rethrows an API 404 as a page 404. */
export const notFoundFrom = (caught: unknown): never => {
  if (caught instanceof CmsApiError && caught.status === 404)
    error(404, Errors.NotFound);
  throw caught;
};

export const text = (form: FormData, key: string) => {
  const value = form.get(key);
  return typeof value === 'string' ? value : '';
};

/** A JSON form field written by an editor; `null` when missing or malformed (the API rejects it). */
export const jsonField = (form: FormData, key: string): unknown => {
  try {
    return JSON.parse(text(form, key)) as unknown;
  } catch {
    return null;
  }
};
