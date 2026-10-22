import { z } from 'zod';
import { Errors } from '#sdk/errors';

export const OIDC_AUTH_METHODS = [
  'client_secret_basic',
  'client_secret_post',
  'none',
] as const;

/** One `subject = email` line: the provider subject that signs in as an existing user. */
const subjectsSchema = z
  .record(
    z.string().trim().min(1).max(255),
    z.email().trim().toLowerCase().max(191),
  )
  .default({});

/** OpenID Connect single sign-on (Settings → Single sign-on). */
export const ssoSettingsSchema = z.object({
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

export type SsoSettings = z.output<typeof ssoSettingsSchema>;

export const ssoSettingsInputSchema = ssoSettingsSchema
  .extend({
    /** Omitted keeps the stored secret; empty removes it. Never returned. */
    clientSecret: z.string().max(500).optional(),
  })
  .refine((value) => !value.enabled || (value.issuer && value.clientId), {
    message: Errors.SsoIssuerRequired,
    path: ['issuer'],
  });

export type SsoSettingsInput = z.input<typeof ssoSettingsInputSchema>;

export const adminSsoSettingsSchema = ssoSettingsSchema.extend({
  clientSecretConfigured: z.boolean(),
  /** The address to register at the provider; empty until the site address is set. */
  redirectUri: z.string(),
  /** Set by the server environment; the settings here are not used while it is. */
  managedByEnvironment: z.boolean(),
});

export type AdminSsoSettings = z.output<typeof adminSsoSettingsSchema>;
