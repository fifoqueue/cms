import type { en } from '#lib/i18n/en.js';
import type { ErrorLookup } from '#lib/i18n/api-errors.js';

/** The shape every language catalog implements: same keys, same parameters, any text. */
export type Messages = {
  [K in keyof typeof en]: (typeof en)[K] extends (...args: infer A) => string
    ? (...args: A) => string
    : string;
};

/** The copy shared by site, admin and catalog-free root error screens. */
export type ErrorMessages = ErrorLookup &
  Pick<
    Messages,
    | 'themeNotFound'
    | 'themeNotFoundHelp'
    | 'errorPageNotFoundHelp'
    | 'errorPageForbidden'
    | 'errorPageForbiddenHelp'
    | 'errorPageServer'
    | 'errorPageServerHelp'
    | 'errorPageOther'
    | 'errorPageHome'
    | 'errorPageBack'
  >;
