import { error, fail } from '@sveltejs/kit';
import { CAPTCHA_REQUIRED, formIssuesSchema } from '@cms/sdk';
import type { IssueParams } from '@cms/sdk';
import { CmsApiError } from '@cms/sdk/client';
import { Errors } from '#lib/errors.js';

/** Every error message the web server throws; shared with the screens that word them. */
export { Errors };

export interface FormIssue {
  path: string;
  message: string;
  /**
   * Values the catalog message leaves out (SDK `issueParamsSchema`); a `probe` issue names
   * where a failed storage connection check left its test file (`bucket`, `key`).
   */
  params?: IssueParams;
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
 * Field issues reduced to `{ path, message }` strings, plus bounded `params` (at most 8 keys of
 * 40 characters, string values of 500; a `probe` issue keeps only its bucket and key). Anything
 * else an error body carries (received values, codes, nested data) never reaches page data.
 */
export const safeIssues = (issues: unknown): FormIssue[] | undefined => {
  const parsed = formIssuesSchema.safeParse(issues);
  return parsed.success
    ? parsed.data.map(({ path, message, params }) =>
        params ? { path, message, params: { ...params } } : { path, message },
      )
    : undefined;
};

/** Schema validation issues as form issues, with dotted field paths. */
export const issuesOf = (
  issues: readonly { path: readonly PropertyKey[]; message: string }[],
): FormIssue[] =>
  issues.map(({ path, message }) => ({
    path: path.map(String).join('.'),
    message,
  }));

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
