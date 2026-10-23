import { z } from 'zod';
import { adminLocaleSchema, roleSchema, userSlugSchema } from '#sdk/auth';

const name = z.string().trim().min(1).max(191);
const email = z.email().max(191);
const bio = z.string().trim().max(2000);
/** Same length bounds as setup; reused by password change and reset. */
export const passwordSchema = z.string().min(8).max(200);

/** A user as listed for administrators. No credentials or session data. */
export const adminUserSummarySchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  slug: z.string(),
  bio: z.string(),
  role: roleSchema,
  createdAt: z.string(),
  /** Entries this user authored, in every status. */
  contentCount: z.number().int().nonnegative(),
});

export type AdminUserSummary = z.output<typeof adminUserSummarySchema>;

/** Creates a user with an initial password, or invites them by email when it is omitted. */
export const userCreateSchema = z.object({
  email,
  name,
  role: roleSchema,
  slug: userSlugSchema.optional(),
  password: passwordSchema.optional(),
});

export type UserCreateInput = z.input<typeof userCreateSchema>;

export const userUpdateSchema = z.object({
  email,
  name,
  role: roleSchema,
  slug: userSlugSchema,
  bio: bio.default(''),
});

export type UserUpdateInput = z.input<typeof userUpdateSchema>;

/** Changing only a user's role (bulk role changes). */
export const userRoleSchema = z.object({ role: roleSchema });

/** What every signed-in user may change about themselves (not their role). */
export const profileUpdateSchema = z.object({
  email,
  name,
  slug: userSlugSchema,
  bio: bio.default(''),
  locale: adminLocaleSchema.default(''),
});

export type ProfileUpdateInput = z.input<typeof profileUpdateSchema>;

/** Content of a removed user goes to `reassignTo`, or is deleted with them when omitted. */
export const userDeleteSchema = z.object({
  reassignTo: z.string().min(1).max(36).optional(),
});

export type UserDeleteInput = z.input<typeof userDeleteSchema>;

/** Changes the signed-in user's password; the current one proves it is them. */
export const passwordChangeSchema = z.object({
  current: z.string().min(1).max(200),
  password: passwordSchema,
});

export type PasswordChangeInput = z.input<typeof passwordChangeSchema>;

/** Always answered the same way, whether or not the address belongs to a user. */
export const passwordResetRequestSchema = z.object({ email });

export const passwordResetSchema = z.object({
  token: z.string().min(16).max(200),
  password: passwordSchema,
});

export type PasswordResetInput = z.input<typeof passwordResetSchema>;

export const apiTokenCreateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  /** Omitted: the token does not expire. */
  expiresInDays: z.number().int().min(1).max(3650).optional(),
});

export type ApiTokenCreateInput = z.input<typeof apiTokenCreateSchema>;

/** An application password as its owner sees it; the secret is shown once at creation. */
export const apiTokenSchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.string(),
  lastUsedAt: z.string().nullable(),
  expiresAt: z.string().nullable(),
});

export type ApiTokenDto = z.output<typeof apiTokenSchema>;

export const apiTokenCreatedSchema = apiTokenSchema.extend({
  /** The bearer secret. Only this response ever contains it. */
  token: z.string(),
});

export type ApiTokenCreated = z.output<typeof apiTokenCreatedSchema>;

/** Prefix that tells API tokens apart from session tokens. */
export const API_TOKEN_PREFIX = 'cms_pat_';
