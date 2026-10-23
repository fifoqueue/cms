import { adminFor, requireCapability } from '#lib/server/session.js';
import type { RequestHandler } from './$types';
export const POST: RequestHandler = async (event) => {
  requireCapability(event.locals, 'users.manage');
  const response = await adminFor(event).privacy.export(event.params.id);
  return new Response(response.body, {
    headers: {
      'content-type': 'application/json',
      'content-disposition': 'attachment; filename=personal-data.json',
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
    },
  });
};
