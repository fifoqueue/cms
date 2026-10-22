import { json } from '@sveltejs/kit';
import { autosaveInputSchema } from '@cms/sdk';
import { CmsApiError } from '@cms/sdk/client';
import { adminFor } from '#lib/server/session.js';
import type { RequestHandler } from './$types';

/** Keeps the editor's unsaved text for the signed-in user (called every 30 seconds). */
export const PUT: RequestHandler = async (event) => {
  const input = autosaveInputSchema.safeParse(
    await event.request.json().catch(() => null),
  );
  if (!input.success) return json({ ok: false }, { status: 400 });
  try {
    await adminFor(event).content.autosave(event.params.id, input.data);
  } catch (caught) {
    if (caught instanceof CmsApiError && caught.status < 500)
      return json({ ok: false }, { status: caught.status });
    throw caught;
  }
  return json({ ok: true });
};
