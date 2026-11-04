import type { AdminEmailSettings } from '#sdk/email';
import type { AdminWebhook } from '#sdk/webhooks';
import type { PluginStatus } from '#sdk/plugins';
import type { DashboardWidget } from '#sdk/plugins';
import type { WxrImportResult } from '#sdk/health';
import type { AdminEgressSettings, EgressService } from '#sdk/egress';
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
      /** Export-file user id of a signed-in commenter (`wp:comment_user_id`); `0` or empty for guests. */
      userId: z.string().optional(),
      /** `wp:comment_author_IP` / `wp:comment_agent`; empty or absent when unknown. */
      authorIp: z.string().optional(),
      authorUserAgent: z.string().optional(),
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

const headerValueSchema = z
  .string()
  .max(998)
  .regex(/^[^\r\n\0]*$/);

/** Only presentation and conversation headers may be supplied by mail filters. */
export const emailHeadersSchema = z
  .record(
    z
      .string()
      .regex(/^(?:X-(?:Mailer|Priority)|Importance|References|In-Reply-To)$/i),
    headerValueSchema,
  )
  .refine((headers) => Object.keys(headers).length <= 16);

export const outgoingEmailSchema = z.object({
  to: z.email(),
  subject: z
    .string()
    .max(998)
    .regex(/^[^\r\n]*$/),
  text: z.string(),
  html: z.string().max(1_000_000).optional(),
  replyTo: z.email().max(254).optional(),
  headers: emailHeadersSchema.optional(),
});

export type OutgoingEmail = z.output<typeof outgoingEmailSchema>;

export const emailFromSchema = z.object({
  name: z
    .string()
    .max(200)
    .regex(/^[^\r\n\0]*$/),
  address: z.email().max(254),
});

export const systemEmailSchema = outgoingEmailSchema
  .pick({ subject: true, text: true, html: true })
  .extend({ kind: z.string().min(1).max(80) });

export interface SystemEmailContext {
  user: { id: string; name: string; email: string };
  site: { title: string; url: string; locale: string };
}

export interface PlatformFilterArgs {
  'email.system': [context: SystemEmailContext];
}

export interface PlatformFilterHooks {
  'task.interval': { name: string; intervalMs: number };
  /** Additional WXR items appended after core data; core export stays streamed. */
  'export.data': z.output<typeof platformWxrItemSchema>[];
  'export.item': z.output<typeof platformImportItemSchema> | null;
  /** Password-free; core re-applies the file's password, so filters cannot read or set it. */
  'import.item': z.output<typeof platformImportItemSchema>;
  /** Authorized dashboard widgets, not raw records or other users' data. */
  'dashboard.data': { widgets: DashboardWidget[]; capabilities: string[] };
  'webhook.payload': unknown;
  /** Never called for sensitive mail (reset/invite/recovery/privacy). */
  'email.beforeSend': OutgoingEmail;
  'email.from': z.output<typeof emailFromSchema>;
  'email.system': z.output<typeof systemEmailSchema>;
  'http.request': {
    service: EgressService;
    method: string;
    readonly url: string;
    headers: Record<string, string>;
  };
  'http.requestAllowed': {
    service: EgressService;
    host: string;
    allowed: boolean;
  };
  /** Core supplies the initial decision; handlers may allow or refuse. Shape and identity stay validated. */
  'email.sendAllowed': { to: string; subject: string; allowed: boolean };
}

/** Platform notifications deliberately exclude message bodies, tokens and provider secrets. */
export interface PlatformActionHooks {
  'http.responded': {
    service: EgressService;
    host: string;
    status: number | null;
    durationMs: number;
  };
  'import.started': { source: 'wxr'; items: number };
  'import.itemImported': {
    sourceId: string;
    contentId: string;
    type: string;
  };
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
  'job.completed': { id: string; kind: string; attempts: number };
  'task.completed': { name: string; durationMs: number };
  'task.failed': { name: string; durationMs: number; error?: string };
}

export interface PluginLifecycle {
  id: string;
  version: string;
  status: PluginStatus;
}
