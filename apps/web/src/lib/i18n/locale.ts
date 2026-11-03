import { ADMIN_LOCALES } from '@cms/sdk/locales';
import type { AdminLocale } from '@cms/sdk';

/** The catalog language for a BCP 47 tag (`ko-KR` → `ko`); English when unsupported. */
export const languageOf = (tag: string): AdminLocale => {
  const base = tag.toLowerCase().split(/[-_]/)[0];
  return (ADMIN_LOCALES as readonly string[]).includes(base ?? '')
    ? (base as AdminLocale)
    : 'en';
};
