import { translationManifest } from '@cms/sdk/i18n-manifest';
import { LOOKUP_KEYS } from '#lib/i18n/overrides.js';

/** Placeholder names of every parameterized administration message, in argument order. */
export const ADMIN_PARAMS: Readonly<Record<string, readonly string[]>> =
  Object.fromEntries(
    Object.entries(translationManifest.admin).filter(
      ([, names]) => names.length > 0,
    ),
  );

/** Administration keys registered text may replace. */
export const ADMIN_KEYS: ReadonlySet<string> = new Set(
  Object.keys(translationManifest.admin).filter((key) => !LOOKUP_KEYS.has(key)),
);
