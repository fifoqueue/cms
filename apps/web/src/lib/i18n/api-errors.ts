import type { Errors } from '@cms/sdk/errors';
import type { Errors as WebErrors } from '#lib/errors.js';

/** A message of the SDK `Errors` catalog (`@cms/sdk/errors`), by its name there. */
export type ApiErrorKey = keyof typeof Errors;

/** A message the web server itself sends (`Errors` in `#lib/errors.js`), by its name there. */
export type WebErrorKey = keyof typeof WebErrors;

/** The values an error reports beside its message (`issues[].params`). */
export type ApiErrorParams = Record<string, string | number>;

/**
 * One language's text for every SDK error, so a new SDK message without text fails to compile.
 * Text that names values is a function of the error's params; it still reads without them.
 */
export type ApiErrorCatalog = Record<
  ApiErrorKey,
  string | ((params: ApiErrorParams) => string)
>;

/** One language's text for every web server error, like `ApiErrorCatalog`. */
export type WebErrorCatalog = Record<
  WebErrorKey,
  string | ((params: ApiErrorParams) => string)
>;

/** An entry's text, with the values the error reported. */
export const apiErrorText = (
  entry: string | ((params: ApiErrorParams) => string) | undefined,
  params: ApiErrorParams = {},
) => (typeof entry === 'function' ? entry(params) : (entry ?? ''));

/** A byte count in megabytes, as in `10 MB`. */
export const megabytes = (bytes: string | number) =>
  `${Math.round(Number(bytes) / 104857.6) / 10} MB`;
