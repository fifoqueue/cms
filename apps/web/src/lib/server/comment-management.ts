import type { RequestEvent } from '@sveltejs/kit';
import type { AdminComment } from '@cms/sdk';
import { adminApi } from '#lib/server/api.js';
import { sessionToken } from '#lib/server/session-cookie.js';

/** Statuses kept out of the public thread that moderators still see in it. */
const HELD_STATUSES = ['pending', 'spam'] as const;
/** Held comments read per status (the API's largest page). */
const HELD_LIMIT = 100;

/** Display fields only: no email, account id or entry data of the commenter. */
const itemView = (item: AdminComment) => ({
  id: item.id,
  parentId: item.parentId,
  parentAuthor: item.parentAuthor,
  authorName: item.authorName,
  authorUrl: item.authorUrl,
  body: item.body,
  status: item.status,
  createdAt: item.createdAt,
});

const managementView = (items: AdminComment[]) => ({
  items: items
    .map(itemView)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
});

export type CommentManagement = ReturnType<typeof managementView>;

/**
 * The entry's pending and spam comments, oldest first, for a signed-in viewer the API lets
 * moderate (`comments.moderate`); null for everyone else or on failure.
 */
export const loadManagement = async (
  event: Pick<RequestEvent, 'url' | 'cookies' | 'fetch'>,
  contentId: string,
): Promise<CommentManagement | null> => {
  const token = sessionToken(event.cookies, event.url);
  if (!token) return null;
  const api = adminApi(event.fetch, token);
  const pages = await Promise.all(
    HELD_STATUSES.map((status) =>
      api.comments.list({ contentId, status, pageSize: HELD_LIMIT }),
    ),
  ).catch(() => null);
  return pages && managementView(pages.flatMap((page) => page.items));
};
