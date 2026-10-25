import { pushRenewSchema } from '@cms/sdk';
import { contentApi } from '#lib/server/api.js';
import {
  forwardPush,
  invalidPushRequest,
  pushRequest,
} from '#lib/server/push.js';
import { visitorOf } from '#lib/server/visitor.js';
import type { RequestHandler } from './$types';

/**
 * The browser replaced a subscription (the worker's `pushsubscriptionchange`, or a page re-sync).
 * `old` carries the replaced subscription's endpoint and auth secret, which prove possession.
 */
export const POST: RequestHandler = async (event) => {
  const input = await pushRequest(event.request, pushRenewSchema);
  if (!input) return invalidPushRequest();
  return forwardPush(() =>
    contentApi(event.fetch).push.renew(
      input.old,
      input.subscription,
      visitorOf(event),
    ),
  );
};
