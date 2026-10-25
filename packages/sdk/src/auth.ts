import { z } from 'zod';
import { capabilitySchema } from '#sdk/capability-contracts';
import { ADMIN_LOCALES } from '#sdk/locales';
import { CONTENT_SLUG, KEBAB_CASE } from '#sdk/common';
import { Errors } from '#sdk/errors';

export const roleSchema = z.string().min(1).max(32).regex(KEBAB_CASE);

/** An administration language; empty follows the site locale. */
export const adminLocaleSchema = z.enum(ADMIN_LOCALES).or(z.literal(''));

/** Public author address segment: kebab-case like content slugs. */
export const userSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .normalize('NFC')
  .min(1)
  .max(191)
  .regex(CONTENT_SLUG);

export const loginSchema = z.object({
  email: z.email().max(191),
  password: z.string().min(1).max(200),
});

export const setupSchema = z.object({
  name: z.string().trim().min(1).max(191),
  email: z.email().max(191),
  password: z.string().min(8).max(200),
});

export type LoginInput = z.input<typeof loginSchema>;
export type SetupInput = z.input<typeof setupSchema>;

/** Authenticated profile only. Never include this DTO in public page data. */
export const adminUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  role: roleSchema,
  capabilities: z.array(capabilitySchema).max(1000).optional(),
  slug: z.string(),
  bio: z.string(),
  locale: adminLocaleSchema,
});

export type AdminUserDto = z.output<typeof adminUserSchema>;
export type UserProfile = AdminUserDto;

export interface SessionGrant {
  token: string;
  expiresAt: string;
  user: UserProfile;
}

export interface SetupStatus {
  setupRequired: boolean;
}

/** Headers a trusted frontend uses to vouch for the address of the browser it serves. */
export const SSO_CLIENT_ADDRESS_HEADER = 'x-cms-client-address';
export const SSO_FRONTEND_SECRET_HEADER = 'x-cms-frontend-secret';
/** The browser's `User-Agent`, trusted (like the address) only next to the frontend secret. */
export const CLIENT_USER_AGENT_HEADER = 'x-cms-client-user-agent';

/**
 * `provider` is the id of a configured provider. `link` attaches the provider account to the
 * signed-in user instead of signing in. `claim` links it to the user of a password reset or
 * invitation link (`token`, consumed on success) and signs them in; it is how users get in
 * while only single sign-on signs in.
 */
export const ssoStartSchema = z
  .object({
    provider: z.string().trim().min(1).max(32),
    intent: z.enum(['login', 'link', 'claim']).default('login'),
    token: z.string().min(1).max(256).optional(),
  })
  .refine((start) => start.intent !== 'claim' || !!start.token, {
    message: Errors.SsoClaimTokenRequired,
    path: ['token'],
  });

/** `query` is the search string the provider appended to the redirect URI. */
export const ssoCallbackSchema = z.object({
  transaction: z.string().min(1).max(256),
  query: z.string().max(8192),
});

export type SsoStartInput = z.input<typeof ssoStartSchema>;
export type SsoCallbackInput = z.input<typeof ssoCallbackSchema>;

export interface SsoInfo {
  /** Enabled providers in display order; empty when single sign-on is off. */
  providers: { id: string; name: string }[];
}

export interface SsoStart {
  /** Where the browser goes next. */
  authorizationUrl: string;
  /** Opaque handle the frontend keeps in an httpOnly cookie until the callback. */
  transaction: string;
  expiresAt: string;
}

export type SsoCallbackResult =
  { kind: 'session'; session: SessionGrant } | { kind: 'linked' };

/** Single sign-on status of the signed-in user. */
export interface SsoIdentityStatus {
  /** Linked provider accounts, at most one per issuer. */
  identities: {
    /** Opaque; used to unlink. */
    id: string;
    issuer: string;
    subject: string;
    linkedAt: string;
    /** Ids of configured providers with this issuer; empty when none is configured any more. */
    providers: string[];
  }[];
  /** Ids of providers whose operator allowlist assigns an account to this user. */
  assigned: string[];
}

/** Sign-in with a one-time recovery code instead of single sign-on. */
export const recoveryLoginSchema = z.object({
  email: z.email().max(191),
  code: z.string().trim().min(1).max(64),
});

export type RecoveryLoginInput = z.input<typeof recoveryLoginSchema>;

/** The signed-in administrator's recovery codes; the codes themselves are shown only once. */
export interface RecoveryCodesStatus {
  remaining: number;
  /** When the current set was generated; `null` when there is none. */
  createdAt: string | null;
}

/** Session grants belong to server-side authentication flows, not page data. */
export const sessionGrantSchema = z.object({
  token: z.string(),
  expiresAt: z.string(),
  user: adminUserSchema,
});

/** One of the signed-in user's sessions. `id` is opaque; the token and its digest are never sent. */
export const sessionInfoSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  expiresAt: z.string(),
  /** The session making the request. */
  current: z.boolean(),
});

export type SessionInfo = z.output<typeof sessionInfoSchema>;

export const setupStatusSchema = z.object({ setupRequired: z.boolean() });
export const ssoInfoSchema = z.object({
  providers: z.array(z.object({ id: z.string(), name: z.string() })),
});
export const ssoStartResultSchema = z.object({
  authorizationUrl: z.string(),
  transaction: z.string(),
  expiresAt: z.string(),
});
export const ssoCallbackResultSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('session'), session: sessionGrantSchema }),
  z.object({ kind: z.literal('linked') }),
]);
export const ssoIdentityStatusSchema = z.object({
  identities: z.array(
    z.object({
      id: z.string(),
      issuer: z.string(),
      subject: z.string(),
      linkedAt: z.string(),
      providers: z.array(z.string()),
    }),
  ),
  assigned: z.array(z.string()),
});
export const recoveryCodesStatusSchema = z.object({
  remaining: z.number().int().min(0),
  createdAt: z.string().nullable(),
});
/** Newly generated codes; replaces the previous set. */
export const recoveryCodesSchema = z.object({ codes: z.array(z.string()) });
