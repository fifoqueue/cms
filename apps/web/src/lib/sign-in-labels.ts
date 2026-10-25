import type { CORE_SECOND_FACTORS, CORE_SIGN_IN_METHODS } from '@cms/sdk';
import type { Messages } from '#lib/i18n/index.js';

/**
 * Core method, factor and field ids are fixed contract constants, so their labels come from the
 * catalog. Anything else (plugins) is shown as the API describes it.
 */
const METHODS: Record<(typeof CORE_SIGN_IN_METHODS)[number], keyof Messages> = {
  password: 'signInMethodPassword',
  passkey: 'signInMethodPasskey',
  sso: 'signInMethodSso',
};

const FACTORS: Record<(typeof CORE_SECOND_FACTORS)[number], keyof Messages> = {
  totp: 'signInFactorTotp',
  passkey: 'signInMethodPasskey',
  'recovery-code': 'signInFactorRecoveryCode',
};

/** Fields core methods and factors declare, by `<owner>.<field name>`. */
const FIELDS: Record<string, keyof Messages> = {
  'password.email': 'signInFieldEmail',
  'password.password': 'signInFieldPassword',
  'totp.code': 'signInFieldTotpCode',
  'recovery-code.code': 'signInFieldRecoveryCode',
};

const own = <T extends object>(table: T, key: string) =>
  Object.hasOwn(table, key)
    ? (table as Record<string, keyof Messages>)[key]
    : undefined;

const text = (
  m: Messages,
  key: keyof Messages | undefined,
  fallback: string,
) => {
  const value = key && m[key];
  return typeof value === 'string' ? value : fallback;
};

export const methodLabel = (
  m: Messages,
  method: { id: string; label: string },
) => text(m, own(METHODS, method.id), method.label);

export const factorLabel = (
  m: Messages,
  factor: { id: string; label: string },
) => text(m, own(FACTORS, factor.id), factor.label);

/** A credential's own name, or its factor's label when it has none beyond that label. */
export const credentialLabel = (
  m: Messages,
  factor: { id: string; label: string },
  credential: { label: string },
) =>
  credential.label && credential.label !== factor.label
    ? credential.label
    : factorLabel(m, factor);

/**
 * A field's label; only fields of a known core owner are translated. Password setup declares
 * the same `password` field with `new-password` autofill, which tells it apart.
 */
export const fieldLabel = (
  m: Messages,
  field: {
    name: string;
    label: string;
    owner: string | null;
    autocomplete?: string;
  },
) =>
  text(
    m,
    field.owner === null
      ? undefined
      : field.owner === 'password' &&
          field.name === 'password' &&
          field.autocomplete === 'new-password'
        ? 'signInFieldNewPassword'
        : own(FIELDS, `${field.owner}.${field.name}`),
    field.label,
  );
