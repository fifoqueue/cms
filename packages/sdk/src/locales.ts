// Pure locale constants: no runtime schema dependencies, safe for browser bundles.

/** Languages of the administration screens and theme copy. */
export const ADMIN_LOCALES = ['en', 'ko'] as const;
export type AdminLocale = (typeof ADMIN_LOCALES)[number];
