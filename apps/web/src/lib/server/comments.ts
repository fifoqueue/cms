import { redirect } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { PAGINATION_MAX_PAGE } from '@cms/sdk';
import type { PublicCaptcha, PublicCommentPage } from '@cms/sdk';
import type { ContentClient } from '@cms/sdk/client';
import { contentApi } from '#lib/server/api.js';
import { failFrom, text } from '#lib/server/errors.js';
import { visitorOf } from '#lib/server/visitor.js';

/** What the comment section shows; the email address of commenters is never part of it. */
export const commentsView = (page: PublicCommentPage) => ({
  items: page.items.map((item) => ({
    id: item.id,
    parentId: item.parentId,
    depth: item.depth,
    authorName: item.authorName,
    authorUrl: item.authorUrl,
    byAuthor: item.byAuthor,
    body: item.body,
    createdAt: item.createdAt,
  })),
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
  url: URL,
  captchaRequest: Promise<PublicCaptcha | null> = api
    .captcha()
    .catch(() => null),
) => {
  const [comments, captcha] = await Promise.all([
    api.comments.list(contentId, commentPage(url)).catch(() => null),
    captchaRequest,
  ]);
  if (!comments || (!comments.open && comments.count === 0)) return null;
  return {
    ...commentsView(comments),
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
  };
  let result;
  try {
    result = await contentApi(event.fetch).comments.submit(
      {
        ...typed,
        contentId: text(form, 'contentId'),
        parentId: text(form, 'parentId') || null,
        website: text(form, 'website'),
      },
      visitorOf(event, form),
    );
  } catch (caught) {
    return failFrom(caught, typed);
  }
  redirect(
    303,
    result.comment
      ? `${event.url.pathname}#comment-${result.comment.id}`
      : `${event.url.pathname}?moderation=1#comments`,
  );
};
