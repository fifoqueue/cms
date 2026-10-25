import {
  EMAIL_PROVIDER_FIELDS,
  EMAIL_PROVIDERS,
  EMAIL_TRANSPORTS,
  SMTP_SECURITY,
} from '@cms/sdk';
import type {
  AdminEmailSettings,
  EmailSettingsInput,
  MailField,
  MailValues,
} from '@cms/sdk';
import { secretInput } from '#lib/admin/settings/input.server.js';
import { pluginFieldName } from '#lib/admin/settings/mail-transports.js';
import { text } from '#lib/server/errors.js';

/** What the form echoes back after a refusal: everything but the secrets. */
export type EmailFormValues = Omit<
  EmailSettingsInput,
  'smtp' | 'http' | 'pluginTransport'
> & {
  smtp: Omit<EmailSettingsInput['smtp'], 'password'>;
  http: Omit<EmailSettingsInput['http'], 'secret'>;
  pluginTransport: { id: string; values: MailValues } | null;
};

type Transports = NonNullable<AdminEmailSettings['availableTransports']>;

/** A declared non-secret field; empty numbers are left out, malformed ones go to the API as typed. */
const fieldValue = (form: FormData, name: string, field: MailField) => {
  if (field.type === 'boolean') return form.has(name);
  const value = text(form, name);
  if (field.type !== 'number' || !value) return value;
  const number = Number(value);
  return Number.isFinite(number) ? number : value;
};

const choice = <T extends string>(
  options: readonly T[],
  value: string,
  fallback: T,
): T => (options.includes(value as T) ? (value as T) : fallback);

/**
 * Reads the email settings form. Field names are the settings paths (`smtp.host`), so issues
 * land next to their inputs. Both transports' fields are always posted; a provider with fixed
 * regions sends its choice as `http.regionChoice`, any other the free `http.region`.
 * `values` never holds a secret; `input` adds them for the API.
 *
 * `transport` is `smtp`, `http` or the id of one of `transports` (plugin mail transports);
 * choosing a plugin keeps the posted `legacyTransport` as the core transport. Plugin fields
 * are named by `pluginFieldName`, so every transport's panel can stay in the form.
 */
export const readEmailForm = (form: FormData, transports: Transports = []) => {
  const provider = choice(
    EMAIL_PROVIDERS,
    text(form, 'http.provider'),
    'sendgrid',
  );
  const chosen = text(form, 'transport');
  const plugin = transports.find((transport) => transport.id === chosen);
  const legacy = choice(
    EMAIL_TRANSPORTS,
    text(form, 'legacyTransport'),
    'smtp',
  );
  const settings: MailValues = {};
  const secrets: Record<string, string> = {};
  for (const field of plugin?.fields ?? []) {
    const name = pluginFieldName(plugin!.id, field.key);
    if (field.type === 'secret') {
      const secret = secretInput(form, name, `${name}.remove`);
      if (secret !== undefined) secrets[field.key] = secret;
      continue;
    }
    const value = fieldValue(form, name, field);
    if (value !== '' || field.type === 'text') settings[field.key] = value;
  }
  const values: EmailFormValues = {
    pluginTransport: plugin ? { id: plugin.id, values: settings } : null,
    enabled: form.has('enabled'),
    fromName: text(form, 'fromName'),
    fromEmail: text(form, 'fromEmail'),
    transport: plugin ? legacy : choice(EMAIL_TRANSPORTS, chosen, legacy),
    smtp: {
      host: text(form, 'smtp.host'),
      port: Math.trunc(Number(text(form, 'smtp.port'))) || 587,
      security: choice(SMTP_SECURITY, text(form, 'smtp.security'), 'starttls'),
      username: text(form, 'smtp.username'),
    },
    http: {
      provider,
      region: text(
        form,
        EMAIL_PROVIDER_FIELDS[provider].regions
          ? 'http.regionChoice'
          : 'http.region',
      ),
      domain: text(form, 'http.domain'),
      keyId: text(form, 'http.keyId'),
      url: text(form, 'http.url'),
      authHeader: text(form, 'http.authHeader'),
      bodyTemplate: text(form, 'http.bodyTemplate'),
    },
  };
  const input: EmailSettingsInput = {
    ...values,
    pluginTransport: plugin
      ? { id: plugin.id, values: settings, secrets }
      : null,
    smtp: {
      ...values.smtp,
      password: secretInput(form, 'smtp.password', 'smtp.passwordRemove'),
    },
    http: {
      ...values.http,
      secret: secretInput(form, 'http.secret', 'http.secretRemove'),
    },
  };
  return { values, input };
};
