import { z } from 'zod';
import { Errors } from '#sdk/errors';

export const SMTP_SECURITY = ['tls', 'starttls', 'none'] as const;

/** Outgoing mail settings as administrators see them; the password is never returned. */
export const adminEmailSettingsSchema = z.object({
  enabled: z.boolean(),
  host: z.string(),
  port: z.number().int(),
  security: z.enum(SMTP_SECURITY),
  username: z.string(),
  passwordConfigured: z.boolean(),
  fromName: z.string(),
  fromEmail: z.string(),
});

export type AdminEmailSettings = z.output<typeof adminEmailSettingsSchema>;

/** Omitted `password` keeps the stored one; an empty string removes it. */
export const emailSettingsInputSchema = z
  .object({
    enabled: z.boolean(),
    host: z.string().trim().max(255),
    port: z.number().int().min(1).max(65_535),
    security: z.enum(SMTP_SECURITY),
    username: z.string().trim().max(255),
    password: z.string().max(500).optional(),
    fromName: z.string().trim().max(191),
    fromEmail: z.email().max(191).or(z.literal('')),
  })
  .refine(
    (settings) => !settings.enabled || (settings.host && settings.fromEmail),
    {
      message: Errors.EmailServerRequired,
      path: ['host'],
    },
  );

export type EmailSettingsInput = z.input<typeof emailSettingsInputSchema>;

export const DEFAULT_EMAIL_SETTINGS: AdminEmailSettings = {
  enabled: false,
  host: '',
  port: 587,
  security: 'starttls',
  username: '',
  passwordConfigured: false,
  fromName: '',
  fromEmail: '',
};

export const emailTestSchema = z.object({ to: z.email().max(191) });
