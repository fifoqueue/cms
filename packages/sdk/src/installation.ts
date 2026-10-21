import { z } from 'zod';
import { setupSchema } from './auth';
import { siteSettingsSchema } from './site';

export const databaseSetupSchema = z.object({
  host: z
    .string()
    .trim()
    .min(1)
    .max(253)
    .regex(/^[a-zA-Z0-9.:[\]-]+$/),
  port: z.number().int().min(1).max(65535).default(3306),
  database: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[\p{L}\p{N}_-]+$/u),
  username: z.string().trim().min(1).max(191),
  password: z.string().max(1000),
});

export const installDatabaseSchema = databaseSetupSchema.extend({
  token: z.string().min(1).max(256),
});

export const installCompleteSchema = z.object({
  token: z.string().min(1).max(256),
  admin: setupSchema,
  site: siteSettingsSchema,
});

export type DatabaseSetupInput = z.input<typeof databaseSetupSchema>;
export type InstallDatabaseInput = z.input<typeof installDatabaseSchema>;
export type InstallCompleteInput = z.input<typeof installCompleteSchema>;

export interface InstallationStatus {
  databaseConfigured: boolean;
  setupRequired: boolean;
}
