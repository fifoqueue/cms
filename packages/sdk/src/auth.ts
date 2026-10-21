import { z } from 'zod';

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

export interface UserProfile {
  id: string;
  email: string;
  name: string;
}

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

/** `link` attaches the provider account to the signed-in user instead of signing in. */
export const ssoStartSchema = z.object({
  intent: z.enum(['login', 'link']).default('login'),
});

/** `query` is the search string the provider appended to the redirect URI. */
export const ssoCallbackSchema = z.object({
  transaction: z.string().min(1).max(256),
  query: z.string().max(8192),
});

export type SsoStartInput = z.input<typeof ssoStartSchema>;
export type SsoCallbackInput = z.input<typeof ssoCallbackSchema>;

export interface SsoInfo {
  enabled: boolean;
  /** Provider label for sign-in buttons. `null` when single sign-on is off. */
  name: string | null;
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
  /** The provider account the user linked, if any. */
  identity: { issuer: string; subject: string; linkedAt: string } | null;
  /** Whether the site operator assigned a provider account to this user. */
  assigned: boolean;
}
