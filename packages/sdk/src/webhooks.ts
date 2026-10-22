import { z } from 'zod';

/** Events a webhook can subscribe to: the core action hooks. */
export const WEBHOOK_EVENTS = [
  'content.created',
  'content.updated',
  'content.published',
  'content.trashed',
  'content.restored',
  'content.deleted',
  'media.uploaded',
  'media.deleted',
  'comment.created',
  'comment.statusChanged',
  'site.updated',
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

/** Header names of a delivery. Receivers verify `X-CMS-Signature` with the webhook's secret. */
export const WEBHOOK_HEADERS = {
  event: 'x-cms-event',
  delivery: 'x-cms-delivery',
  /** `t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<body>">` */
  signature: 'x-cms-signature',
} as const;

export const webhookInputSchema = z.object({
  /** Deliveries go to https addresses only. */
  url: z.url({ protocol: /^https$/ }).max(500),
  events: z.array(z.enum(WEBHOOK_EVENTS)).min(1).max(WEBHOOK_EVENTS.length),
  enabled: z.boolean().default(true),
});

export type WebhookInput = z.input<typeof webhookInputSchema>;

export const adminWebhookSchema = z.object({
  id: z.string(),
  url: z.string(),
  events: z.array(z.enum(WEBHOOK_EVENTS)),
  enabled: z.boolean(),
  /** HTTP status of the last delivery attempt; null before the first. */
  lastStatus: z.number().int().nullable(),
  lastError: z.string().nullable(),
  lastAttemptAt: z.string().nullable(),
});

export type AdminWebhook = z.output<typeof adminWebhookSchema>;

/** Returned once, when a webhook is created or its secret is replaced. */
export const webhookSecretSchema = adminWebhookSchema.extend({
  secret: z.string(),
});

export type WebhookWithSecret = z.output<typeof webhookSecretSchema>;
