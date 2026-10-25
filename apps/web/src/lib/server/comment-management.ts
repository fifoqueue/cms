import type { RequestEvent } from '@sveltejs/kit';
import type { AdminComment, PublicCommentPage } from '@cms/sdk';
import { adminApi } from '#lib/server/api.js';
import { sessionToken } from '#lib/server/session-cookie.js';
import { themePreviewToken } from '#lib/server/theme-preview.js';
import { clientProof } from '#lib/server/visitor.js';
import type { ProofEvent } from '#lib/server/visitor.js';

/** Statuses kept out of the public thread that moderators still see in it. */
const HELD_STATUSES = ['pending', 'spam'] as const;
/** Held comments read per status, and ids per `ids` lookup (the API's largest page). */
const HELD_LIMIT = 100;

/** Where a comment was sent from, keyed by comment id; comments without either are left out. */
const originsOf = (items: AdminComment[]) =>
  Object.fromEntries(
    items
      .filter((item) => item.authorIp || item.authorUserAgent)
      .map((item) => [
        item.id,
        { ip: item.authorIp, userAgent: item.authorUserAgent },
      ]),
  );

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

const managementView = (held: AdminComment[], shown: AdminComment[]) => ({
  items: held
    .map(itemView)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
  origins: originsOf([...held, ...shown]),
});

export type CommentManagement = ReturnType<typeof managementView>;
export type CommentOrigin = CommentManagement['origins'][string];

/**
 * The entry's pending and spam comments, oldest first, and the author IP address and browser of
 * those and of the comments on `thread`, for a signed-in viewer the API lets moderate
 * (`comments.moderate`); null for everyone else or on failure.
 */
export const loadManagement = async (
  event: Pick<RequestEvent, 'url' | 'cookies' | 'fetch'> & ProofEvent,
  contentId: string,
  thread: Promise<PublicCommentPage | null>,
): Promise<CommentManagement | null> => {
  const token = sessionToken(event.cookies, event.url);
  if (!token) return null;
  const api = adminApi(event.fetch, token, clientProof(event));
  const pages = await Promise.all(
    HELD_STATUSES.map((status) =>
      api.comments.list({ contentId, status, pageSize: HELD_LIMIT }),
    ),
  ).catch(() => null);
  if (!pages) return null;
  const held = pages.flatMap((page) => page.items);
  // A theme preview is a page shown to others (screenshots, shared screens): no origins at all.
  if (themePreviewToken(event.cookies))
    return { ...managementView(held, []), origins: {} };
  const page = await thread;
  const visible = page
    ? [...page.items, ...(page.ownPending ? [page.ownPending] : [])]
    : [];
  const ids = visible
    .map((item) => item.id)
    .filter((id) => !held.some((item) => item.id === id));
  const batches = Array.from(
    { length: Math.ceil(ids.length / HELD_LIMIT) },
    (_, index) => ids.slice(index * HELD_LIMIT, (index + 1) * HELD_LIMIT),
  );
  // Without the thread's origins the held list still serves.
  const shown = await Promise.all(
    batches.map((batch) =>
      api.comments.list({ ids: batch, contentId, pageSize: HELD_LIMIT }),
    ),
  ).then(
    (lists) => lists.flatMap((list) => list.items),
    () => [],
  );
  return managementView(held, shown);
};
