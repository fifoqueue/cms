import { z } from 'zod';
import {
  CLIENT_USER_AGENT_HEADER,
  SSO_CLIENT_ADDRESS_HEADER,
  SSO_FRONTEND_SECRET_HEADER,
} from '#sdk/auth';
import { adminEmailSettingsSchema } from '#sdk/email';
import type { AdminEmailSettings, EmailSettingsInput } from '#sdk/email';
import {
  CAPTCHA_TOKEN_HEADER,
  adminSecuritySettingsSchema,
  publicCaptchaSchema,
} from '#sdk/security';
import type {
  AdminSecuritySettings,
  PublicCaptcha,
  SecuritySettingsInput,
} from '#sdk/security';
import { adminSsoSettingsSchema } from '#sdk/sso-settings';
import type { AdminSsoSettings, SsoSettingsInput } from '#sdk/sso-settings';
import type { Request } from '#sdk/transport';
import { adminEgressSettingsSchema } from '#sdk/egress';
import type { AdminEgressSettings, EgressSettingsInput } from '#sdk/egress';
import { apiTokenCreatedSchema, apiTokenSchema } from '#sdk/users';
import type {
  ApiTokenCreateInput,
  ApiTokenCreated,
  ApiTokenDto,
  PasswordChangeInput,
  PasswordResetInput,
} from '#sdk/users';

/**
 * How a frontend server vouches for the browser it acts for. `secret` is the frontend secret
 * shared with the API (server-side only); `address` is the browser's IP address.
 */
export interface ClientProof {
  address: string;
  secret: string;
  /** The browser's `User-Agent`; the API stores it with the comments that browser writes. */
  userAgent?: string;
}

/** A visitor's proven address and solved captcha, for rate-limited actions. */
export interface Visitor {
  proof?: ClientProof;
  captchaToken?: string | null;
}

/** Headers that carry `visitor` to the API. */
export const visitorHeaders = ({ proof, captchaToken }: Visitor = {}) => ({
  ...(proof && {
    [SSO_CLIENT_ADDRESS_HEADER]: proof.address,
    [SSO_FRONTEND_SECRET_HEADER]: proof.secret,
    ...(proof.userAgent && { [CLIENT_USER_AGENT_HEADER]: proof.userAgent }),
  }),
  ...(captchaToken && { [CAPTCHA_TOKEN_HEADER]: captchaToken }),
});

/** Single sign-on settings and the frontend secret; administrators only. */
export const ssoAdminClient = (request: Request) => ({
  ssoSettings: {
    get: () =>
      request<AdminSsoSettings>('GET', '/api/v1/admin/sso', {
        response: adminSsoSettingsSchema,
      }),
    update: (input: SsoSettingsInput) =>
      request<AdminSsoSettings>('PUT', '/api/v1/admin/sso', {
        json: input,
        response: adminSsoSettingsSchema,
      }),
  },
  /** For the web server only: it proves visitors' addresses with this. Never send it to a browser. */
  frontendSecret: () =>
    request<{ secret: string }>('GET', '/api/v1/admin/frontend-secret', {
      response: z.object({ secret: z.string().min(16) }),
    }),
});

/** Password flows that need no session. */
export const passwordRecoveryClient = (request: Request) => ({
  /** Answers the same whether or not the address has an account. */
  forgot: (email: string, visitor?: Visitor) =>
    request<void>('POST', '/api/v1/auth/password/forgot', {
      json: { email },
      headers: visitorHeaders(visitor),
    }),
  reset: (input: PasswordResetInput) =>
    request<void>('POST', '/api/v1/auth/password/reset', { json: input }),
});

/** The signed-in user's password and application passwords. */
export const credentialsClient = (request: Request) => ({
  changePassword: (input: PasswordChangeInput) =>
    request<void>('PUT', '/api/v1/auth/password', { json: input }),
  tokens: {
    list: () =>
      request<ApiTokenDto[]>('GET', '/api/v1/auth/tokens', {
        response: z.array(apiTokenSchema),
      }),
    create: (input: ApiTokenCreateInput) =>
      request<ApiTokenCreated>('POST', '/api/v1/auth/tokens', {
        json: input,
        response: apiTokenCreatedSchema,
      }),
    revoke: (id: string) =>
      request<void>('DELETE', `/api/v1/auth/tokens/${encodeURIComponent(id)}`),
  },
});

export const captchaClient = (request: Request) => ({
  captcha: () =>
    request<PublicCaptcha>('GET', '/api/v1/security/captcha', {
      response: publicCaptchaSchema,
    }),
});

/** Security and mail settings (`settings.manage`). */
export const securityAdminClient = (request: Request) => ({
  security: {
    settings: () =>
      request<AdminSecuritySettings>('GET', '/api/v1/admin/security', {
        response: adminSecuritySettingsSchema,
      }),
    update: (input: SecuritySettingsInput) =>
      request<AdminSecuritySettings>('PUT', '/api/v1/admin/security', {
        json: input,
        response: adminSecuritySettingsSchema,
      }),
  },
  email: {
    settings: () =>
      request<AdminEmailSettings>('GET', '/api/v1/admin/email', {
        response: adminEmailSettingsSchema,
      }),
    update: (input: EmailSettingsInput) =>
      request<AdminEmailSettings>('PUT', '/api/v1/admin/email', {
        json: input,
        response: adminEmailSettingsSchema,
      }),
    test: (to: string) =>
      request<void>('POST', '/api/v1/admin/email/test', { json: { to } }),
  },
  /** Private destinations; needs the separate `egress.manage` capability. */
  egress: {
    settings: () =>
      request<AdminEgressSettings>('GET', '/api/v1/admin/egress', {
        response: adminEgressSettingsSchema,
      }),
    update: (input: EgressSettingsInput) =>
      request<AdminEgressSettings>('PUT', '/api/v1/admin/egress', {
        json: input,
        response: adminEgressSettingsSchema,
      }),
  },
});
