import { getContext, setContext } from 'svelte';
import type { AdminLocale } from '@cms/sdk';
import type { ErrorMessages, Messages } from '#lib/i18n/messages.js';
import type { SiteMessages } from '#lib/i18n/site.js';

const KEY = Symbol('i18n');

export interface I18n<M> {
  readonly m: M;
  readonly language: AdminLocale;
}

export const provideCatalog = <M>(catalog: I18n<M>) => setContext(KEY, catalog);

// Root error screens have no layout catalog. Keep this fallback independent of either
// full locale, so shared components do not pull administration copy onto public pages.
export const rootI18n = {
  language: 'en',
  m: {
    themeNotFound: 'Page not found',
    themeNotFoundHelp:
      'The page you are looking for does not exist or has moved. Try searching instead.',
    errorPageNotFoundHelp:
      'Check the address, or start again from the home page.',
    errorPageForbidden: 'You can’t open this page',
    errorPageForbiddenHelp:
      'Your account doesn’t have permission for this page.',
    errorPageServer: 'Something went wrong',
    errorPageServerHelp:
      'Please try again in a moment. If it keeps happening, let the site administrator know.',
    errorPageOther: 'This request couldn’t be completed',
    errorPageHome: 'Go home',
    errorPageBack: 'Go back',
    apiError: (key) =>
      key === 'AuthenticationRequired'
        ? 'Sign in to continue.'
        : key === 'Forbidden'
          ? 'You do not have permission to do this'
          : undefined,
    webError: (key) =>
      key === 'Forbidden'
        ? 'You do not have permission to view this page'
        : undefined,
  },
} satisfies I18n<ErrorMessages>;

/** Public and shared components see only keys present in both site and admin catalogs. */
export const useI18n = () => getContext<I18n<SiteMessages>>(KEY);

/** Admin layouts provide the complete catalog. */
export const useAdminI18n = () => getContext<I18n<Messages>>(KEY);

export const useErrorI18n = (): I18n<ErrorMessages> =>
  getContext<I18n<ErrorMessages> | undefined>(KEY) ?? rootI18n;
