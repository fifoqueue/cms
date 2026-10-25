import { json } from '@sveltejs/kit';
import { CmsApiError } from '@cms/sdk/client';
import { adminFor } from '#lib/server/session.js';

/** The push key for the entry editor; editing never fails because notifications are unavailable. */
export const editorPushKey = (event: Parameters<typeof adminFor>[0]) =>
  adminFor(event)
    .pushSubscription.key()
    .then((result) => result.publicKey)
    .catch(() => null);

/** An SDK request schema. */
interface Schema<T> {
  safeParse(value: unknown): { success: true; data: T } | { success: false };
}

/**
 * Same-site JSON routes the browser and the push worker call; the API address and tokens stay
 * on the server. Only `application/json` bodies are read, so another site cannot send one
 * without a CORS preflight.
 */
export const pushRequest = async <T>(
  request: Request,
  schema: Schema<T>,
): Promise<T | null> => {
  if (!request.headers.get('content-type')?.startsWith('application/json'))
    return null;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return null;
  }
  const parsed = schema.safeParse(body);
  return parsed.success ? parsed.data : null;
};

export const invalidPushRequest = () =>
  json({ code: 'invalid_input' }, { status: 400 });

/** Runs the API call: 204, or the API's refusal as `{ message, code }` with its status. */
export const forwardPush = async (call: () => Promise<unknown>) => {
  try {
    await call();
    return new Response(null, { status: 204 });
  } catch (caught) {
    if (caught instanceof CmsApiError && caught.status < 500)
      return json(
        { message: caught.message, code: caught.code },
        { status: caught.status },
      );
    throw caught;
  }
};
