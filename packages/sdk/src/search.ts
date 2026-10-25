import { z } from 'zod';
import { issueParamsSchema } from '#sdk/common';
import { Errors } from '#sdk/errors';

/** Meilisearch connection (Settings → Search). MariaDB answers searches whenever it is off or behind. */
export const searchSettingsSchema = z.object({
  enabled: z.boolean().default(false),
  /** The Meilisearch server, such as `http://127.0.0.1:7700`. */
  host: z
    .string()
    .trim()
    .max(500)
    .refine(
      (value) =>
        value === '' || /^https?:\/\/[^\s/?#]+(\/[^\s?#]*)?$/i.test(value),
      Errors.SearchHostInvalid,
    )
    .default(''),
  /** Index names start with this, so several sites can share a server. */
  indexPrefix: z
    .string()
    .trim()
    .regex(/^[a-z0-9_]{1,40}$/, Errors.SearchPrefixInvalid)
    .default('cms'),
});

export type SearchSettings = z.output<typeof searchSettingsSchema>;

export const searchSettingsInputSchema = searchSettingsSchema
  .extend({
    /** Omitted keeps the stored key; empty removes it. Never returned. */
    apiKey: z.string().max(500).optional(),
  })
  .refine((value) => !value.enabled || value.host !== '', {
    message: Errors.SearchHostRequired,
    path: ['host'],
  });

export type SearchSettingsInput = z.input<typeof searchSettingsInputSchema>;

export const adminSearchSettingsSchema = searchSettingsSchema.extend({
  apiKeyConfigured: z.boolean(),
});

export type AdminSearchSettings = z.output<typeof adminSearchSettingsSchema>;

export const SEARCH_STATES = [
  'disabled',
  'building',
  'syncing',
  'ready',
  'failing',
] as const;

/** Which engine answers public searches right now, and why. */
export const searchStatusSchema = z.object({
  /** `meilisearch` only while the index holds every committed change. */
  engine: z.enum(['database', 'meilisearch']),
  state: z.enum(SEARCH_STATES),
  /** Changes waiting to reach the index. */
  pending: z.number().int(),
  /** Entries in the index; null when it cannot be read. */
  documents: z.number().int().nullable(),
  /** The last failure, in words fit for administrators. */
  lastError: z.string().nullable(),
  /** Values the catalog `lastError` leaves out (`SearchRequestFailed` → `status`). */
  lastErrorParams: issueParamsSchema.optional(),
  lastSyncAt: z.string().nullable(),
});

export type SearchStatus = z.output<typeof searchStatusSchema>;

export const searchTestResultSchema = z.object({ version: z.string() });
