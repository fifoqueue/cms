import type { AdminSsoSettings, OIDC_AUTH_METHODS } from '@cms/sdk';

export type OidcAuthMethod = (typeof OIDC_AUTH_METHODS)[number];

/** One provider as the settings form shows and posts it; never a secret. */
export interface SsoProviderValues {
  /**
   * The page's key for a provider added and not saved yet (its ID can still be chosen); empty
   * for saved providers, whose ID is fixed.
   */
  draft: string;
  id: string;
  enabled: boolean;
  name: string;
  issuer: string;
  clientId: string;
  authMethod: OidcAuthMethod;
  scopes: string;
  /** `subject = email` lines. */
  allowedSubjects: string;
}

/** Fields of a provider; form names and issue paths are `providers.<index>.<field>`. */
export const SSO_PROVIDER_FIELDS = [
  'id',
  'enabled',
  'name',
  'issuer',
  'clientId',
  'authMethod',
  'scopes',
  'clientSecret',
  'allowedSubjects',
] as const;

export type SsoProviderField = (typeof SSO_PROVIDER_FIELDS)[number];

/** A provider to fill in. */
export const blankProvider = (draft: string): SsoProviderValues => ({
  draft,
  id: '',
  enabled: true,
  name: '',
  issuer: '',
  clientId: '',
  authMethod: 'client_secret_basic',
  scopes: 'openid',
  allowedSubjects: '',
});

/** Saved providers as form values, without their secrets. */
export const ssoProviderValues = (
  providers: AdminSsoSettings['providers'],
): SsoProviderValues[] =>
  providers.map((provider) => ({
    draft: '',
    id: provider.id,
    enabled: provider.enabled,
    name: provider.name,
    issuer: provider.issuer,
    clientId: provider.clientId,
    authMethod: provider.authMethod,
    scopes: provider.scopes,
    allowedSubjects: Object.entries(provider.allowedSubjects)
      .map(([subject, email]) => `${subject} = ${email}`)
      .join('\n'),
  }));

/**
 * The provider field an issue belongs to (`providers.0.allowedSubjects.alice` → index 0,
 * `allowedSubjects`), or null for an issue the form lists apart.
 */
export const ssoIssueField = (
  path: string,
): { index: number; field: SsoProviderField } | null => {
  const [root, index, field] = path.split('.');
  return root === 'providers' &&
    /^\d+$/.test(index ?? '') &&
    (SSO_PROVIDER_FIELDS as readonly string[]).includes(field ?? '')
    ? { index: Number(index), field: field as SsoProviderField }
    : null;
};
