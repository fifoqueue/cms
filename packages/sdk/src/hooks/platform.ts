import type { AdminEmailSettings } from '#sdk/email';
import type { AdminWebhook } from '#sdk/webhooks';
import type { PluginStatus } from '#sdk/plugins';
import type { DashboardWidget } from '#sdk/plugins';
import type { WxrImportResult } from '#sdk/health';
import type { AdminEgressSettings } from '#sdk/egress';
import { z } from 'zod';

/** WXR items accepted at the plugin boundary; dates retain their native representation. */
export const platformWxrItemSchema = z.object({
  id: z.string(),
  type: z.string(),
  title: z.string(),
  slug: z.string(),
  html: z.string(),
  excerpt: z.string(),
  status: z.string(),
  publishedAt: z.date().nullable(),
  author: z.string(),
  password: z.string(),
  sticky: z.boolean(),
  commentsOpen: z.boolean(),
  categories: z.array(z.string()),
  tags: z.array(z.string()),
  comments: z.array(
    z.object({
      id: z.string(),
      parentId: z.string().nullable(),
      authorName: z.string(),
      authorEmail: z.string(),
      authorUrl: z.string(),
      body: z.string(),
      approved: z.string(),
      type: z.string(),
      createdAt: z.date(),
    }),
  ),
  link: z.string().optional(),
  parentId: z.string().optional(),
  menuOrder: z.number().optional(),
  attachmentUrl: z.string().optional(),
  meta: z.record(z.string(), z.string()).optional(),
  menus: z.array(z.object({ slug: z.string(), name: z.string() })).optional(),
});

/** `import.item` values: the imported entry password never reaches filters. */
export const platformImportItemSchema = platformWxrItemSchema.omit({
  password: true,
});

export const outgoingEmailSchema = z.object({
  to: z.email(),
  subject: z
    .string()
    .max(998)
    .regex(/^[^\r\n]*$/),
  text: z.string(),
});

export interface PlatformFilterHooks {
  /** Additional WXR items appended after core data; core export stays streamed. */
  'export.data': z.output<typeof platformWxrItemSchema>[];
  /** Password-free; core re-applies the file's password, so filters cannot read or set it. */
  'import.item': z.output<typeof platformImportItemSchema>;
  /** Authorized dashboard widgets, not raw records or other users' data. */
  'dashboard.data': { widgets: DashboardWidget[]; capabilities: string[] };
  'webhook.payload': unknown;
  /** Never called for sensitive mail (reset/invite/recovery/privacy). */
  'email.beforeSend': z.output<typeof outgoingEmailSchema>;
  'email.sendAllowed': { to: string; subject: string; allowed: boolean };
}

/** Platform notifications deliberately exclude message bodies, tokens and provider secrets. */
export interface PlatformActionHooks {
  'import.completed': WxrImportResult;
  'export.generated': { format: 'wxr' };
  'site.installed': {
    title: string;
    description: string;
    locale: string;
    siteUrl: string;
  };
  'egress.updated': AdminEgressSettings;
  'webhook.created': AdminWebhook;
  'webhook.updated': AdminWebhook;
  'webhook.deleted': AdminWebhook;
  'webhook.delivered': {
    id: string;
    deliveryId: string;
    status: number | null;
  };
  'webhook.failed': { id: string; deliveryId: string; status: number | null };
  'plugin.installed': PluginLifecycle;
  'plugin.upgraded': PluginLifecycle;
  'plugin.activated': PluginLifecycle;
  'plugin.deactivated': PluginLifecycle;
  'plugin.removed': PluginLifecycle;
  'email.sent': { to: string };
  'email.failed': { to: string };
  'email.settingsUpdated': AdminEmailSettings;
  'job.failed': {
    id: string;
    kind: string;
    attempts: number;
    retryAt: string | null;
  };
}

export interface PluginLifecycle {
  id: string;
  version: string;
  status: PluginStatus;
}
