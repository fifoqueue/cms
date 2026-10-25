import { OIDC_AUTH_METHODS } from '@cms/sdk';
import type { SsoSettingsInput } from '@cms/sdk';
import { secretInput } from '#lib/admin/settings/input.server.js';
import type {
  OidcAuthMethod,
  SsoProviderValues,
} from '#lib/admin/settings/sso-form.js';
import { text } from '#lib/server/errors.js';

const PROVIDER_ID = /^providers\.(\d+)\.id$/;

/**
 * `subject = email` lines. Split at the last `=`: a subject may contain one, an address cannot.
 * A line without one keeps its text as the subject, so the address check reports it.
 */
export const readSubjects = (value: string): Record<string, string> =>
  Object.fromEntries(
    value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const at = line.lastIndexOf('=');
        return at < 0
          ? [line, '']
          : [line.slice(0, at).trim(), line.slice(at + 1).trim()];
      }),
  );

/**
 * Reads the providers of the single sign-on form, in index order. Fields are named by settings
 * path (`providers.0.issuer`), so issues land next to their inputs. `values` never holds a
 * secret; `input` adds them, with the subjects parsed, for the API.
 */
export const readSsoProviders = (form: FormData) => {
  const indexes = [
    ...new Set(
      [...form.keys()]
        .map((name) => PROVIDER_ID.exec(name)?.[1])
        .filter((index) => index !== undefined)
        .map(Number),
    ),
  ].sort((a, b) => a - b);
  const posted = indexes.map((index) => {
    const field = (name: string) => `providers.${index}.${name}`;
    const method = text(form, field('authMethod'));
    const values: SsoProviderValues = {
      draft: text(form, field('draft')),
      id: text(form, field('id')),
      enabled: form.has(field('enabled')),
      name: text(form, field('name')),
      issuer: text(form, field('issuer')),
      clientId: text(form, field('clientId')),
      authMethod: (OIDC_AUTH_METHODS as readonly string[]).includes(method)
        ? (method as OidcAuthMethod)
        : 'client_secret_basic',
      scopes: text(form, field('scopes')),
      allowedSubjects: text(form, field('allowedSubjects')),
    };
    return {
      values,
      // A draft has nothing stored to keep: an empty secret must not inherit the secret of a
      // removed provider that used the same id.
      clientSecret: values.draft
        ? text(form, field('clientSecret'))
        : secretInput(form, field('clientSecret'), field('clientSecretRemove')),
    };
  });
  const input: SsoSettingsInput['providers'] = posted.map(
    ({ values, clientSecret }) => ({
      id: values.id,
      enabled: values.enabled,
      name: values.name,
      issuer: values.issuer,
      clientId: values.clientId,
      authMethod: values.authMethod,
      scopes: values.scopes,
      allowedSubjects: readSubjects(values.allowedSubjects),
      clientSecret,
    }),
  );
  return { values: posted.map(({ values }) => values), input };
};
