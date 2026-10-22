import { json } from '@sveltejs/kit';
import { CmsApiError } from '@cms/sdk/client';
import { MEDIA_FILENAME_HEADER } from '@cms/sdk';
import { adminFor, requireCapability } from '#lib/server/session.js';
import type { RequestHandler } from './$types';

/** Streams one browser upload to the API; answers with the stored media or the API's error. */
export const POST: RequestHandler = async (event) => {
  requireCapability(event.locals, 'media.upload');
  let name = 'file';
  try {
    name = decodeURIComponent(
      event.request.headers.get(MEDIA_FILENAME_HEADER) ?? 'file',
    );
  } catch {
    // Keep the generic name.
  }
  try {
    return json(
      await adminFor(event).media.upload(
        event.request.body ?? new Uint8Array(),
        name,
      ),
      { status: 201 },
    );
  } catch (caught) {
    if (caught instanceof CmsApiError && caught.status < 500)
      return json({ message: caught.message }, { status: caught.status });
    throw caught;
  }
};
