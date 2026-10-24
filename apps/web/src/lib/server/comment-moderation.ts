import { fail, redirect } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { adminApi, contentApi } from '#lib/server/api.js';
import { loadManagement } from '#lib/server/comment-management.js';
import { commentsView, readThread } from '#lib/server/comments.js';
import { Errors, failFrom, text } from '#lib/server/errors.js';
import { sessionToken } from '#lib/server/session-cookie.js';
import { unlockProofs } from '#lib/server/unlock.js';

/** What a moderator can do to a comment from the public page. */
export const MODERATION_OPERATIONS = [
  'approve',
  'unapprove',
  'trash',
  'delete',
] as const;

const NOTICES = {
  approve: 'commentNoticeApproved',
  unapprove: 'commentNoticeUnapproved',
  trash: 'commentNoticeTrash',
  delete: 'commentNoticeDeleted',
} as const satisfies Record<(typeof MODERATION_OPERATIONS)[number], string>;

/** Marks every refusal so a page without scripts can tell it from other form failures. */
const FAILED = { moderationFailed: true } as const;

const isId = (value: FormDataEntryValue): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 36;

/** Comments one request may change, the moderation API's bulk limit. */
const MAX_IDS = 100;

/**
 * The id of the entry whose comments this address shows (the static front page at `/`), read
 * with the visitor's unlock proofs; null when it shows none or the entry is still locked.
 */
const shownEntry = async (event: RequestEvent, token: string) => {
  const api = contentApi(event.fetch, token);
  const reading = await api.reading().catch(() => null);
  const { pathname, searchParams } = event.url;
  const root = pathname === '/';
  const path = root
    ? !searchParams.has('q') && !searchParams.has('type')
      ? reading?.frontPagePath
      : null
    : pathname;
  if (!path) return null;
  const resolved = await api
    .resolvePath(path, unlockProofs(event.cookies))
    .catch(() => null);
  if (!resolved || resolved.redirect || resolved.content.protected) return null;
  const { content } = resolved;
  // These addresses redirect or list posts instead of showing the entry's comments.
  if (
    !root &&
    (content.path === reading?.frontPagePath ||
      content.path === reading?.postsPagePath)
  )
    return null;
  return content.id;
};

/**
 * Approves, unapproves, trashes or permanently deletes (`confirm=delete`) the comments
 * (`commentId`, repeatable) of the entry this page shows. The API authorizes
 * `comments.moderate` and checks that every comment belongs to that entry. Enhanced requests
 * get the refreshed thread and moderation list.
 */
export const moderateCommentAction = async (event: RequestEvent) => {
  event.setHeaders({ 'cache-control': 'private, no-store' });
  const form = await event.request.formData();
  const sent = form.getAll('commentId');
  const commentIds = sent.filter(isId);
  const contentId = text(form, 'contentId');
  const operation = MODERATION_OPERATIONS.find(
    (option) => option === text(form, 'operation'),
  );
  const token = sessionToken(event.cookies, event.url);
  if (!token)
    return fail(403, {
      ...FAILED,
      message: Errors.Forbidden,
      code: 'forbidden',
    });
  if (
    !operation ||
    !commentIds.length ||
    commentIds.length > MAX_IDS ||
    commentIds.length !== sent.length ||
    new Set(commentIds).size !== commentIds.length ||
    !isId(contentId) ||
    (operation === 'delete' && text(form, 'confirm') !== 'delete')
  )
    return fail(400, {
      ...FAILED,
      message: Errors.ModerationInvalid,
      code: 'invalid_input',
    });
  // The entry comes from the address, never from the form alone.
  if ((await shownEntry(event, token)) !== contentId)
    return fail(404, {
      ...FAILED,
      message: Errors.NotFound,
      code: 'not_found',
    });
  try {
    await adminApi(event.fetch, token).comments.bulk({
      ids: commentIds,
      action: operation,
      contentId,
    });
  } catch (caught) {
    return failFrom(caught, FAILED);
  }
  if (event.request.headers.get('x-sveltekit-action') !== 'true') {
    const search = new URLSearchParams(event.url.search);
    search.delete('/moderateComment');
    search.set('commentNotice', NOTICES[operation]);
    redirect(303, `${event.url.pathname}?${search}#comment-moderation`);
  }
  // The change is saved; a failed refresh only leaves the lists for the next page load.
  const [comments, management] = await Promise.all([
    readThread(contentApi(event.fetch, token), contentId, event),
    loadManagement(event, contentId),
  ]);
  return {
    moderated: true,
    operation,
    commentIds,
    notice: NOTICES[operation],
    comments: comments ? commentsView(comments) : null,
    management,
  };
};

export type ModerationActionResult = Extract<
  Awaited<ReturnType<typeof moderateCommentAction>>,
  { moderated: boolean }
>;
