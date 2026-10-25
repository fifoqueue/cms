import type { MailField, MailValues } from '@cms/sdk';
import { secretInput } from '#lib/admin/settings/input.server.js';
import { pluginFieldName } from '#lib/admin/settings/mail-transports.js';
import { text } from '#lib/server/errors.js';

/** A declared non-secret field; empty numbers are left out, malformed ones go to the API as typed. */
const fieldValue = (form: FormData, name: string, field: MailField) => {
  if (field.type === 'boolean') return form.has(name);
  const value = text(form, name);
  if (field.type !== 'number' || !value) return value;
  const number = Number(value);
  return Number.isFinite(number) ? number : value;
};

/**
 * Reads the declared fields of a plugin contribution (a mail transport, a storage driver), named
 * by `pluginFieldName`. A secret is left out when its field is empty (keep the saved one), is
 * `''` when its removal box is checked, and is never part of `values`.
 */
export const readPluginFields = (
  form: FormData,
  id: string,
  fields: readonly MailField[],
) => {
  const values: MailValues = {};
  const secrets: Record<string, string> = {};
  for (const field of fields) {
    const name = pluginFieldName(id, field.key);
    if (field.type === 'secret') {
      const secret = secretInput(form, name, `${name}.remove`);
      if (secret !== undefined) secrets[field.key] = secret;
      continue;
    }
    const value = fieldValue(form, name, field);
    if (value !== '' || field.type === 'text') values[field.key] = value;
  }
  return { values, secrets };
};
