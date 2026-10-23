import { redirect } from '@sveltejs/kit';
import { notFoundFrom } from '#lib/server/errors.js';
import { adminFor, requireCapability } from '#lib/server/session.js';
import type { RequestHandler } from './$types';

/** "View on site": the comment on its published entry, else the entry's editor. */
export const GET: RequestHandler = async (event) => {
  requireCapability(event.locals, 'comments.moderate');
  const entry = await adminFor(event)
    .content.get(event.params.id)
    .catch(notFoundFrom);
  const comment = event.url.searchParams.get('comment') ?? '';
  // Only an id-shaped fragment is added to the address.
  const anchor = /^[\w-]{1,36}$/.test(comment) ? `#comment-${comment}` : '';
  redirect(
    303,
    entry.status === 'published' && !entry.trashedAt
      ? `${entry.path}${anchor}`
      : `/admin/content/${encodeURIComponent(entry.id)}`,
  );
};
