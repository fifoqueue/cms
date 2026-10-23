import { redirect } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { commenterSchema, PAGINATION_MAX_PAGE } from '@cms/sdk';
import type { PublicCaptcha, PublicComment, PublicCommentPage } from '@cms/sdk';
import type { ContentClient } from '@cms/sdk/client';
import { contentApi } from '#lib/server/api.js';
import { failFrom, text } from '#lib/server/errors.js';
import { unlockProofs } from '#lib/server/unlock.js';
import { SESSION_COOKIE } from '#lib/server/session.js';
import { visitorOf } from '#lib/server/visitor.js';

const COMMENTER_COOKIE = 'cms_commenter';
const COMMENTER_PROOF_COOKIE = 'cms_commenter_proof';

const commentView = (item: PublicComment) => ({
  id: item.id,
  parentId: item.parentId,
  depth: item.depth,
  authorName: item.authorName,
  authorUrl: item.authorUrl,
  byAuthor: item.byAuthor,
  avatarUrl: item.avatarUrl,
  pending: item.pending,
  body: item.body,
  createdAt: item.createdAt,
});

/** Display fields only; email addresses never enter a public comment. */
export const commentsView = (page: PublicCommentPage) => ({
  items: page.items.map(commentView),
  ownPending: page.ownPending ? commentView(page.ownPending) : null,
  viewer: page.viewer ? { name: page.viewer.name } : null,
  requireLogin: page.requireLogin,
  total: page.total,
  count: page.count,
  page: page.page,
  pageSize: page.pageSize,
  open: page.open,
  threadDepth: page.threadDepth,
  truncated: page.truncated,
});

export type CommentsView = ReturnType<typeof commentsView>;

/** `?cpage=` as a positive integer (1 when missing or invalid). */
const commentPage = (url: URL) => {
  const page = Math.trunc(Number(url.searchParams.get('cpage')));
  return Number.isSafeInteger(page) && page > 0
    ? Math.min(page, PAGINATION_MAX_PAGE)
    : 1;
};

/**
 * The entry's comment section and the captcha settings for its form; nothing when the entry
 * neither takes nor has comments. A failure leaves the page without comments.
 */
export const loadComments = async (
  api: ContentClient,
  contentId: string,
  event: Pick<RequestEvent, 'url' | 'cookies'>,
  captchaRequest: Promise<PublicCaptcha | null> = api
    .captcha()
    .catch(() => null),
) => {
  const [comments, captcha] = await Promise.all([
    api.comments
      .list(
        contentId,
        commentPage(event.url),
        unlockProofs(event.cookies),
        event.cookies.get(`cms_pending_${contentId}`),
      )
      .catch(() => null),
    captchaRequest,
  ]);
  if (
    !comments ||
    (!comments.open && comments.count === 0 && !comments.ownPending)
  )
    return null;
  let remembered = null;
  try {
    const saved = commenterSchema.safeParse(
      JSON.parse(event.cookies.get(COMMENTER_COOKIE) ?? 'null'),
    );
    if (saved.success) remembered = saved.data;
  } catch {
    /* Ignore malformed visitor preferences. */
  }
  return {
    ...commentsView(comments),
    remembered: comments.viewer ? null : remembered,
    captcha:
      captcha && comments.open
        ? {
            provider: captcha.provider,
            siteKey: captcha.siteKey,
            always: captcha.always,
          }
        : null,
  };
};

export type CommentSection = NonNullable<
  Awaited<ReturnType<typeof loadComments>>
>;

/**
 * Form action for a new comment. Not enhanced, because a captcha widget must render fresh; on
 * success it redirects so reloading never sends the comment twice.
 */
export const commentAction = async (event: RequestEvent) => {
  const form = await event.request.formData();
  const typed = {
    authorName: text(form, 'authorName'),
    authorEmail: text(form, 'authorEmail'),
    authorUrl: text(form, 'authorUrl'),
    body: text(form, 'body'),
    parentId: text(form, 'parentId'),
    parentName: text(form, 'parentName'),
    remember: form.has('remember'),
  };
  let result;
  try {
    result = await contentApi(
      event.fetch,
      event.cookies.get(SESSION_COOKIE),
    ).comments.submit(
      {
        ...typed,
        contentId: text(form, 'contentId'),
        parentId: text(form, 'parentId') || null,
        website: text(form, 'website'),
      },
      visitorOf(event, form),
      unlockProofs(event.cookies),
      event.cookies.get(COMMENTER_PROOF_COOKIE),
    );
  } catch (caught) {
    return failFrom(caught, typed);
  }
  const options = {
    path: '/',
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: event.url.protocol === 'https:',
  };
  if (!event.cookies.get(SESSION_COOKIE) && typed.remember) {
    const saved = commenterSchema.safeParse(typed);
    if (saved.success) {
      event.cookies.set(COMMENTER_COOKIE, JSON.stringify(saved.data), {
        ...options,
        maxAge: 365 * 24 * 60 * 60,
      });
      if (result.commenterProof)
        event.cookies.set(COMMENTER_PROOF_COOKIE, result.commenterProof, {
          ...options,
          maxAge: 365 * 24 * 60 * 60,
        });
    }
  } else {
    event.cookies.delete(COMMENTER_COOKIE, { path: '/' });
    event.cookies.delete(COMMENTER_PROOF_COOKIE, { path: '/' });
  }
  if (result.pendingProof)
    event.cookies.set(
      `cms_pending_${text(form, 'contentId')}`,
      result.pendingProof,
      { ...options, maxAge: 24 * 60 * 60 },
    );
  const search = new URLSearchParams({ cpage: String(result.page) });
  if (!result.comment) search.set('moderation', '1');
  redirect(
    303,
    `${event.url.pathname}?${search}#${result.comment ? `comment-${result.comment.id}` : 'comments'}`,
  );
};
