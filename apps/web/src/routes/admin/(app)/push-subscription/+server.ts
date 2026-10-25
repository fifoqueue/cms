import { userPushRemovalSchema, userPushSchema } from '@cms/sdk';
import {
  forwardPush,
  invalidPushRequest,
  pushRequest,
} from '#lib/server/push.js';
import { adminFor } from '#lib/server/session.js';
import type { RequestHandler } from './$types';

/** This browser receives the signed-in user's comment notifications. */
export const PUT: RequestHandler = async (event) => {
  const input = await pushRequest(event.request, userPushSchema);
  if (!input) return invalidPushRequest();
  return forwardPush(() =>
    adminFor(event).pushSubscription.save(input.subscription),
  );
};

/** This browser stops receiving them. */
export const DELETE: RequestHandler = async (event) => {
  const input = await pushRequest(event.request, userPushRemovalSchema);
  if (!input) return invalidPushRequest();
  return forwardPush(() =>
    adminFor(event).pushSubscription.remove(input.endpoint),
  );
};
