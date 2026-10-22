import type { en } from '#lib/i18n/en.js';

/** The shape every language catalog implements: same keys, same parameters, any text. */
export type Messages = {
  [K in keyof typeof en]: (typeof en)[K] extends (...args: infer A) => string
    ? (...args: A) => string
    : string;
};
