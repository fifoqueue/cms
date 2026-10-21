import { error, fail } from '@sveltejs/kit';
import { CmsApiError } from '@cms/sdk/client';

export interface FormFailure {
  message: string;
  issues?: unknown;
}

/** Turns API client errors (4xx) into a form failure. Anything else is rethrown. */
export const failFrom = (caught: unknown) => {
  if (caught instanceof CmsApiError && caught.status < 500) {
    return fail(caught.status, {
      message: caught.message,
      issues: caught.issues,
    } satisfies FormFailure);
  }
  throw caught;
};

/** Rethrows an API 404 as a page 404. */
export const notFoundFrom = (caught: unknown): never => {
  if (caught instanceof CmsApiError && caught.status === 404)
    error(404, 'Not found');
  throw caught;
};

export const text = (form: FormData, key: string) => {
  const value = form.get(key);
  return typeof value === 'string' ? value : '';
};
