import { z } from 'zod';
import { Errors } from '#sdk/errors';

export const OIDC_AUTH_METHODS = [
  'client_secret_basic',
  'client_secret_post',
  'none',
] as const;

/** One `subject = email` line: the provider subject that signs in as an existing user. */
const subjectsSchema = z
  .record(z.string().min(1).max(255), z.email().trim().toLowerCase().max(191))
  .default({});

/** Stable provider id: sign-in requests, links and the login page refer to it. */
export const SSO_PROVIDER_ID = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/;
export const SSO_PROVIDERS_MAX = 10;
/** Id of the provider configured by the server environment (`OIDC_*`). */
export const SSO_ENVIRONMENT_PROVIDER = 'environment';

export const ssoProviderIdSchema = z
  .string()
  .trim()
  .regex(SSO_PROVIDER_ID, Errors.SsoProviderIdInvalid);

/** One OpenID Connect provider (Settings → Single sign-on). */
export const ssoProviderSchema = z.object({
  id: ssoProviderIdSchema,
  enabled: z.boolean().default(false),
  /** Sign-in button label. */
  name: z.string().trim().min(1).max(64).default('SSO'),
  /** The provider's issuer (https, no query). */
  issuer: z
    .string()
    .trim()
    .max(255)
    .refine(
      (value) =>
        value === '' ||
        (/^https:\/\/[^\s?#]+$/i.test(value) && URL.canParse(value)),
      Errors.SsoIssuerInvalid,
    )
    .default(''),
  clientId: z.string().trim().max(255).default(''),
  authMethod: z.enum(OIDC_AUTH_METHODS).default('client_secret_basic'),
  /** Space-separated; must include `openid`. */
  scopes: z
    .string()
    .trim()
    .max(500)
    .transform(
      (value) => value.split(/\s+/).filter(Boolean).join(' ') || 'openid',
    )
    .refine(
      (value) => value.split(' ').includes('openid'),
      Errors.SsoScopesOpenid,
    )
    .default('openid'),
  allowedSubjects: subjectsSchema,
});

export type SsoProvider = z.output<typeof ssoProviderSchema>;

const uniqueIds = (providers: { id: string }[], ctx: z.RefinementCtx) => {
  const seen = new Set<string>();
  providers.forEach(({ id }, index) => {
    if (seen.has(id))
      ctx.addIssue({
        code: 'custom',
        message: Errors.SsoProviderIdDuplicate,
        path: ['providers', index, 'id'],
      });
    seen.add(id);
  });
};

/** Provider configuration only. Sign-in policy lives in Settings → Sign-in. */
export const ssoSettingsSchema = z
  .object({
    providers: z.array(ssoProviderSchema).max(SSO_PROVIDERS_MAX).default([]),
  })
  .superRefine(({ providers }, ctx) => uniqueIds(providers, ctx));

export type SsoSettings = z.output<typeof ssoSettingsSchema>;

export const ssoSettingsInputSchema = z
  .object({
    /** Accepted for one release, ignored; use Settings → Sign-in instead. */
    passwordLogin: z.boolean().optional(),
    providers: z
      .array(
        ssoProviderSchema.extend({
          /** Omitted keeps the stored secret of this provider id; empty removes it. Never returned. */
          clientSecret: z.string().max(500).optional(),
        }),
      )
      .max(SSO_PROVIDERS_MAX),
  })
  .superRefine(({ providers }, ctx) => {
    uniqueIds(providers, ctx);
    providers.forEach((provider, index) => {
      if (provider.enabled && !(provider.issuer && provider.clientId))
        ctx.addIssue({
          code: 'custom',
          message: Errors.SsoIssuerRequired,
          path: ['providers', index, 'issuer'],
        });
    });
  });

export type SsoSettingsInput = z.input<typeof ssoSettingsInputSchema>;

export const adminSsoSettingsSchema = z.object({
  providers: z.array(
    ssoProviderSchema.extend({ clientSecretConfigured: z.boolean() }),
  ),
  /** The address to register at every provider; empty until the site address is set. */
  redirectUri: z.string(),
  /**
   * The provider set by the server environment (`OIDC_*`), shown read-only. While it is set,
   * the providers stored here are kept but unused.
   */
  environmentProvider: z
    .object({ id: z.string(), name: z.string() })
    .nullable(),
});

export type AdminSsoSettings = z.output<typeof adminSsoSettingsSchema>;
