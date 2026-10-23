import { z } from 'zod';
import { permalinkPathSchema } from '#sdk/permalinks';
export const PRIVACY_ACTIONS = ['export', 'erase'] as const;
export const privacySettingsSchema = z.object({
  policyPageId: z.string().min(1).max(36).nullable().default(null),
  commentCookies: z.boolean().default(true),
});
export const publicPrivacySchema = z.strictObject({
  policy: z
    .strictObject({ title: z.string(), path: permalinkPathSchema })
    .nullable(),
  commentCookies: z.boolean(),
});
export const privacyInputSchema = z.object({
  email: z.string().trim().toLowerCase().max(191).pipe(z.email()),
  action: z.enum(PRIVACY_ACTIONS),
});
export const privacyConfirmationSchema = z.object({
  token: z.string().min(1).max(512),
});
export const privacyRequestSchema = z.strictObject({
  id: z.string(),
  email: z.string(),
  action: z.enum(PRIVACY_ACTIONS),
  status: z.enum(['pending', 'confirmed', 'completed']),
  createdAt: z.string(),
  expiresAt: z.string(),
  confirmedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
});
export type PrivacySettings = z.output<typeof privacySettingsSchema>;
export type PrivacyRequest = z.output<typeof privacyRequestSchema>;
export type PublicPrivacy = z.output<typeof publicPrivacySchema>;
export type PrivacyAction = (typeof PRIVACY_ACTIONS)[number];

/** Private browser proof storage, bounded to keep the cookie below browser/header limits. */
export const privacyProofsSchema = z
  .array(
    z
      .strictObject({
        id: z.string().regex(/^[0-9a-f-]{36}$/i),
        token: z
          .string()
          .max(512)
          .regex(/^[A-Za-z0-9_.-]+$/),
      })
      .refine((proof) => proof.token.startsWith(`${proof.id}.`)),
  )
  .max(5);
