import { z } from 'zod';
import { siteHealthSchema, wxrImportResultSchema } from '#sdk/health';
import type {
  SiteHealth,
  WxrImportOptions,
  WxrImportResult,
} from '#sdk/health';
import { adminWebhookSchema, webhookSecretSchema } from '#sdk/webhooks';
import type {
  AdminWebhook,
  WebhookInput,
  WebhookWithSecret,
} from '#sdk/webhooks';
import type { Request } from '#sdk/transport';

/** Webhooks, import/export and site health; needs `tools.manage`. */
export const toolsAdminClient = (request: Request) => {
  const hookPath = (id: string) =>
    `/api/v1/admin/webhooks/${encodeURIComponent(id)}`;
  return {
    /** The whole site as a WordPress export (WXR) document. */
    exportWxr: () =>
      request<Response>('GET', '/api/v1/admin/export', { raw: true }),
    importWxr: (xml: string, options: WxrImportOptions = {}) =>
      request<WxrImportResult>('POST', '/api/v1/admin/import', {
        query: { authors: options.authors },
        body: xml,
        contentType: 'application/xml',
        response: wxrImportResultSchema,
      }),
    health: () =>
      request<SiteHealth>('GET', '/api/v1/admin/health', {
        response: siteHealthSchema,
      }),
    webhooks: {
      list: () =>
        request<AdminWebhook[]>('GET', '/api/v1/admin/webhooks', {
          response: z.array(adminWebhookSchema),
        }),
      create: (input: WebhookInput) =>
        request<WebhookWithSecret>('POST', '/api/v1/admin/webhooks', {
          json: input,
          response: webhookSecretSchema,
        }),
      update: (id: string, input: WebhookInput) =>
        request<AdminWebhook>('PUT', hookPath(id), {
          json: input,
          response: adminWebhookSchema,
        }),
      rotate: (id: string) =>
        request<WebhookWithSecret>('POST', `${hookPath(id)}/rotate`, {
          response: webhookSecretSchema,
        }),
      ping: (id: string) => request<void>('POST', `${hookPath(id)}/ping`),
      remove: (id: string) => request<void>('DELETE', hookPath(id)),
    },
  };
};
