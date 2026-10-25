import { z } from 'zod';
import { adminUserSchema } from '#sdk/auth';
import type { UserProfile } from '#sdk/auth';
import type { Request } from '#sdk/transport';
import { profileMetaSchema } from '#sdk/user-contracts';
import type { ProfileValues } from '#sdk/user-contracts';
import { adminUserSummarySchema } from '#sdk/users';
import type {
  AdminUserSummary,
  ProfileUpdateInput,
  UserCreateInput,
  UserUpdateInput,
} from '#sdk/users';

/** Someone who can be named as an entry's author. */
export const authorOptionSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Public author slug, for the `author` list filter. */
  slug: z.string(),
});

export type AuthorOption = z.output<typeof authorOptionSchema>;
export type ProfileMeta = z.output<typeof profileMetaSchema>;

/** User administration (`users.manage`) and author choices (`content.editOthers`). */
export const usersClient = (request: Request) => {
  const path = (id: string) => `/api/v1/admin/users/${encodeURIComponent(id)}`;
  return {
    list: () =>
      request<AdminUserSummary[]>('GET', '/api/v1/admin/users', {
        response: z.array(adminUserSummarySchema),
      }),
    authors: () =>
      request<AuthorOption[]>('GET', '/api/v1/admin/users/authors', {
        response: z.array(authorOptionSchema),
      }),
    create: (input: UserCreateInput) =>
      request<AdminUserSummary>('POST', '/api/v1/admin/users', {
        json: input,
        response: adminUserSummarySchema,
      }),
    update: (id: string, input: UserUpdateInput) =>
      request<AdminUserSummary>('PUT', path(id), {
        json: input,
        response: adminUserSummarySchema,
      }),
    /** Changes only the role; profile fields stay as stored. */
    setRole: (id: string, role: string) =>
      request<void>('PUT', `${path(id)}/role`, { json: { role } }),
    /** Signs the user out of every session; API tokens keep working. */
    signOutEverywhere: (id: string) =>
      request<void>('DELETE', `${path(id)}/sessions`),
    /**
     * Plugin-declared profile fields and their values. Users may read and save their own;
     * other users need `users.manage`.
     */
    profileFields: (id: string) =>
      request<ProfileMeta>('GET', `${path(id)}/fields`, {
        response: profileMetaSchema,
      }),
    /** Partial update; each value is checked against its field's declaration. */
    saveProfileFields: (id: string, values: ProfileValues) =>
      request<ProfileMeta>('PUT', `${path(id)}/fields`, {
        json: values,
        response: profileMetaSchema,
      }),
    /** Emails the user a password reset link (limited per administrator). */
    sendPasswordReset: (id: string) =>
      request<void>('POST', `${path(id)}/password-reset`),
    /** Without `reassignTo`, their content is deleted with them. */
    remove: (id: string, reassignTo?: string) =>
      request<void>('DELETE', path(id), { query: { reassignTo } }),
  };
};

/** The signed-in user's own profile. */
export const profileClient = (request: Request) => ({
  update: (input: ProfileUpdateInput) =>
    request<UserProfile>('PUT', '/api/v1/auth/me', {
      json: input,
      response: adminUserSchema,
    }),
});
