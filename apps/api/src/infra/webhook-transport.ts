import { createHmac } from 'node:crypto';
import { WEBHOOK_HEADERS } from '@cms/sdk';
import type { WebhookTransport } from '#api/domain/webhooks/webhook-service';
import { publicFetch } from '#api/infra/egress-policy';

/** Signed JSON POSTs. Redirects are not followed, so a delivery reaches only the saved address. */
export const httpWebhookTransport: WebhookTransport = {
  async send({ url, secret, event, deliveryId, body }) {
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = createHmac('sha256', secret)
      .update(`${timestamp}.${body}`)
      .digest('hex');
    const response = await publicFetch(url, {
      method: 'POST',
      redirect: 'manual',
      signal: AbortSignal.timeout(10_000),
      headers: {
        'content-type': 'application/json',
        'user-agent': 'cms-webhooks',
        [WEBHOOK_HEADERS.event]: event,
        [WEBHOOK_HEADERS.delivery]: deliveryId,
        [WEBHOOK_HEADERS.signature]: `t=${timestamp},v1=${signature}`,
      },
      body,
    });
    await response.body?.cancel();
    return response.status;
  },
};
