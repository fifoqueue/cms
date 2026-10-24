import { OIDC_AUTH_METHODS } from '@cms/sdk';
import type { SsoSettingsInput } from '@cms/sdk';
import { text } from '#lib/server/errors.js';
import { submitAction } from '#lib/server/form-action.js';
import { secretInput } from '#lib/admin/settings/input.server.js';
import { adminFor } from '#lib/server/session.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  const sso = await adminFor(event).ssoSettings.get();
  return {
    sso: {
      enabled: sso.enabled,
      name: sso.name,
      issuer: sso.issuer,
      clientId: sso.clientId,
      authMethod: sso.authMethod,
      scopes: sso.scopes,
      allowedSubjects: sso.allowedSubjects,
      clientSecretConfigured: sso.clientSecretConfigured,
      redirectUri: sso.redirectUri,
      managedByEnvironment: sso.managedByEnvironment,
    },
  };
};

/** `subject = email` lines; the API validates both sides. */
const subjects = (value: string) =>
  Object.fromEntries(
    value
      .split('\n')
      .map((line) => line.split('='))
      .filter((parts) => parts.length === 2)
      .map(([subject, email]) => [subject!.trim(), email!.trim()]),
  );

export const actions: Actions = {
  save: async (event) => {
    const form = await event.request.formData();
    const method = text(form, 'authMethod');
    const input: SsoSettingsInput = {
      enabled: form.has('enabled'),
      name: text(form, 'name') || 'SSO',
      issuer: text(form, 'issuer'),
      clientId: text(form, 'clientId'),
      authMethod: (OIDC_AUTH_METHODS as readonly string[]).includes(method)
        ? (method as SsoSettingsInput['authMethod'])
        : 'client_secret_basic',
      scopes: text(form, 'scopes'),
      allowedSubjects: subjects(text(form, 'allowedSubjects')),
      clientSecret: secretInput(form, 'clientSecret', 'removeSecret'),
    };
    return submitAction(() => adminFor(event).ssoSettings.update(input));
  },
};
