import { commentPushSchema } from '@cms/sdk';
import { contentApi } from '#lib/server/api.js';
import {
  forwardPush,
  invalidPushRequest,
  pushRequest,
} from '#lib/server/push.js';
import { visitorOf } from '#lib/server/visitor.js';
import type { RequestHandler } from './$types';

/** Replies to the comment this browser just sent (its `pushToken`) arrive here by push. */
export const POST: RequestHandler = async (event) => {
  const input = await pushRequest(event.request, commentPushSchema);
  if (!input) return invalidPushRequest();
  return forwardPush(() =>
    contentApi(event.fetch).comments.subscribePush(
      input.token,
      input.subscription,
      visitorOf(event),
    ),
  );
};
