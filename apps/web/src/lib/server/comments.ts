import { redirect } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { commenterSchema } from '@cms/sdk';
import type { PublicCaptcha, PublicComment, PublicCommentPage } from '@cms/sdk';
import type { ContentClient } from '@cms/sdk/client';
import { contentApi } from '#lib/server/api.js';
import { loadManagement } from '#lib/server/comment-management.js';
import { failFrom, text } from '#lib/server/errors.js';
import { pageParam } from '#lib/server/public-view.js';
import { unlockProofs } from '#lib/server/unlock.js';
import { sessionToken } from '#lib/server/session-cookie.js';
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
  fields: {
    name: page.fields.name,
    email: page.fields.email,
    website: page.fields.website,
  },
  total: page.total,
  count: page.count,
  page: page.page,
  pageSize: page.pageSize,
  open: page.open,
  threadDepth: page.threadDepth,
  truncated: page.truncated,
});

export type CommentsView = ReturnType<typeof commentsView>;
export type { CommentManagement } from '#lib/server/comment-management.js';

/**
 * The approved thread page at `?cpage=` (with the visitor's pending receipt), or null when it
 * cannot be read.
 */
export const readThread = (
  api: ContentClient,
  contentId: string,
  event: Pick<RequestEvent, 'url' | 'cookies'>,
) =>
  api.comments
    .list(
      contentId,
      pageParam(event.url, 'cpage'),
      unlockProofs(event.cookies),
      event.cookies.get(`cms_pending_${contentId}`),
    )
    .catch(() => null);

/**
 * The entry's comment section and the captcha settings for its form; nothing when the entry
 * neither takes nor has comments. A failure leaves the page without comments. Moderators also
 * get `management`, this entry's pending and spam comments (see `loadManagement`).
 */
export const loadComments = async (
  api: ContentClient,
  contentId: string,
  event: Pick<
    RequestEvent,
    'url' | 'cookies' | 'fetch' | 'request' | 'setHeaders'
  >,
  captchaRequest: Promise<PublicCaptcha | null> = api
    .captcha()
    .catch(() => null),
) => {
  const [comments, captcha, management] = await Promise.all([
    readThread(api, contentId, event),
    captchaRequest,
    loadManagement(event, contentId),
  ]);
  // Actions set their own caching rule; a page that shows moderation data is never cached.
  if (management && event.request.method === 'GET')
    event.setHeaders({ 'cache-control': 'private, no-store' });
  if (
    !comments ||
    (!comments.open &&
      comments.count === 0 &&
      !comments.ownPending &&
      !management?.items.length)
  )
    return null;
  const privacy = await api
    .privacy()
    .catch(() => ({ policy: null, commentCookies: false }));
  let remembered = null;
  try {
    const saved = commenterSchema.safeParse(
      JSON.parse(event.cookies.get(COMMENTER_COOKIE) ?? 'null'),
    );
    if (saved.success)
      remembered = {
        authorName: comments.fields.name ? saved.data.authorName : '',
        authorEmail: comments.fields.email ? saved.data.authorEmail : '',
        authorUrl: comments.fields.website ? saved.data.authorUrl : '',
      };
  } catch {
    /* Ignore malformed visitor preferences. */
  }
  return {
    ...commentsView(comments),
    privacyPolicy: privacy.policy,
    commentCookies: privacy.commentCookies,
    remembered: comments.viewer || !privacy.commentCookies ? null : remembered,
    management,
    captcha:
      captcha && comments.open
        ? {
            provider: captcha.provider,
            siteKey: captcha.siteKey,
            always: captcha.always,
            widget: captcha.widget,
          }
        : null,
  };
};

export type CommentSection = NonNullable<
  Awaited<ReturnType<typeof loadComments>>
>;

/**
 * Enhanced submissions return only refreshed comment data; ordinary forms redirect after saving.
 */
export const commentAction = async (event: RequestEvent) => {
  event.setHeaders({ 'cache-control': 'private, no-store' });
  const form = await event.request.formData();
  const contentId = text(form, 'contentId');
  const api = contentApi(event.fetch, sessionToken(event.cookies, event.url));
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
    result = await api.comments.submit(
      {
        ...typed,
        contentId,
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
  if (result.pendingProof)
    event.cookies.set(`cms_pending_${contentId}`, result.pendingProof, {
      ...options,
      maxAge: 24 * 60 * 60,
    });
  else event.cookies.delete(`cms_pending_${contentId}`, { path: '/' });
  // A read failure must not turn a committed submission into a retryable failure.
  const comments = await api.comments
    .list(
      contentId,
      result.page,
      unlockProofs(event.cookies),
      result.pendingProof ?? event.cookies.get(`cms_pending_${contentId}`),
    )
    .catch(() => null);
  const remember =
    !sessionToken(event.cookies, event.url) &&
    typed.remember &&
    comments &&
    (comments.fields.name || comments.fields.email || comments.fields.website);
  const privacy = remember
    ? await contentApi(event.fetch)
        .privacy()
        .catch(() => ({ commentCookies: false }))
    : { commentCookies: false };
  if (remember && privacy.commentCookies && comments) {
    const saved = commenterSchema.safeParse({
      authorName: comments.fields.name ? typed.authorName : '',
      authorEmail: comments.fields.email ? typed.authorEmail : '',
      authorUrl: comments.fields.website ? typed.authorUrl : '',
    });
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
      else event.cookies.delete(COMMENTER_PROOF_COOKIE, { path: '/' });
    }
  } else {
    event.cookies.delete(COMMENTER_COOKIE, { path: '/' });
    event.cookies.delete(COMMENTER_PROOF_COOKIE, { path: '/' });
  }
  const search = new URLSearchParams(event.url.search);
  search.delete('/comment');
  search.set('cpage', String(result.page));
  if (!result.comment) search.set('moderation', '1');
  else search.delete('moderation');
  const location = `${event.url.pathname}?${search}#${result.comment ? `comment-${result.comment.id}` : 'comments'}`;
  if (event.request.headers.get('x-sveltekit-action') === 'true')
    return {
      commented: true,
      comments: comments ? commentsView(comments) : null,
      moderation: result.status === 'pending',
      location,
    };
  redirect(303, location);
};

export type CommentActionResult = Extract<
  Awaited<ReturnType<typeof commentAction>>,
  { commented: boolean }
>;
