import { requireCapability, adminFor } from '#lib/server/session.js';
import type { RequestHandler } from './$types';

/** Downloads the WordPress export file. */
export const GET: RequestHandler = async (event) => {
  requireCapability(event.locals, 'tools.manage');
  const exported = await adminFor(event).exportWxr();
  const date = new Date().toISOString().slice(0, 10);
  return new Response(exported.body, {
    headers: {
      'content-type': 'application/rss+xml; charset=utf-8',
      'content-disposition': `attachment; filename="site-${date}.xml"`,
      'cache-control': 'no-store',
    },
  });
};
