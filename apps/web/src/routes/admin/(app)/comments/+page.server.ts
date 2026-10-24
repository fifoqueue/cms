import { COMMENT_BULK_ACTIONS, COMMENT_STATUSES } from '@cms/sdk';
import type { CommentStatus } from '@cms/sdk';
import { failFrom, text } from '#lib/server/errors.js';
import { clampPage } from '#lib/server/page-range.js';
import { readScreenOptions } from '#lib/server/screen-options.js';
import { adminFor, requireCapability } from '#lib/server/session.js';
import { COMMENT_COLUMNS } from '#lib/admin/screen-options.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  requireCapability(event.locals, 'comments.moderate');
  const params = event.url.searchParams;
  const status = COMMENT_STATUSES.find(
    (option) => option === params.get('status'),
  );
  const search = (params.get('q') ?? '').trim().slice(0, 200) || undefined;
  const contentId = params.get('contentId')?.slice(0, 36) || undefined;
  const page = Math.max(1, Math.trunc(Number(params.get('page'))) || 1);
  const admin = adminFor(event);
  const screen = readScreenOptions(
    event.cookies,
    'comments',
    COMMENT_COLUMNS,
    20,
  );
  const [comments, counts] = await Promise.all([
    admin.comments.list({
      status,
      search,
      contentId,
      page,
      pageSize: screen.perPage,
    }),
    admin.comments.counts(),
  ]);
  clampPage(event.url, comments);
  return {
    filter: { status, q: search, contentId },
    counts,
    screen,
    comments: {
      ...comments,
      items: comments.items.map((item) => ({
        id: item.id,
        contentId: item.contentId,
        contentTitle: item.contentTitle,
        parentId: item.parentId,
        parentAuthor: item.parentAuthor,
        authorName: item.authorName,
        authorEmail: item.authorEmail,
        authorUrl: item.authorUrl,
        body: item.body,
        status: item.status as CommentStatus,
        createdAt: item.createdAt,
      })),
    },
  };
};

/** Counted catalog notices (`(count) => text`), sent with `count`. */
const NOTICES = {
  approve: 'commentsApproved',
  unapprove: 'commentsUnapproved',
  spam: 'commentsSpammed',
  trash: 'commentsTrashed',
  delete: 'commentsDeleted',
} as const satisfies Record<(typeof COMMENT_BULK_ACTIONS)[number], string>;

/** The action that returns a comment to a status. */
const UNDO = {
  approved: 'approve',
  pending: 'unapprove',
  spam: 'spam',
  trash: 'trash',
} as const satisfies Record<CommentStatus, string>;

export const actions: Actions = {
  /** One action for every selected comment (or the single comment of a row button). */
  bulk: async (event) => {
    const form = await event.request.formData();
    const action = COMMENT_BULK_ACTIONS.find(
      (option) => option === text(form, 'action'),
    );
    const ids = form.getAll('ids').filter((id) => typeof id === 'string');
    if (!action || !ids.length) return {};
    try {
      await adminFor(event).comments.bulk({ ids, action });
    } catch (caught) {
      return failFrom(caught);
    }
    // Undo puts the comments back where they were, when that status is known.
    const previous = COMMENT_STATUSES.find(
      (option) => option === text(form, 'previous'),
    );
    return {
      notice: NOTICES[action],
      count: ids.length,
      undo:
        previous && action !== 'delete'
          ? { ids, action: UNDO[previous] }
          : undefined,
    };
  },
  /** Deletes every comment in the spam or trash view (WordPress "Empty Spam/Trash"). */
  empty: async (event) => {
    const form = await event.request.formData();
    const status = text(form, 'status');
    if (status !== 'spam' && status !== 'trash') return {};
    const admin = adminFor(event);
    try {
      // Bounded: at most 100 pages of 100 per request.
      for (let round = 0; round < 100; round++) {
        const { items } = await admin.comments.list({
          status,
          page: 1,
          pageSize: 100,
        });
        if (!items.length) break;
        await admin.comments.bulk({
          ids: items.map(({ id }) => id),
          action: 'delete',
        });
      }
    } catch (caught) {
      return failFrom(caught);
    }
    // The request is bounded; when comments remain, say so instead of "Emptied".
    const remaining = await admin.comments
      .list({ status, page: 1, pageSize: 1 })
      .then(
        ({ total }) => total,
        () => 0,
      );
    return {
      notice: remaining ? 'commentNoticePartlyEmptied' : 'commentNoticeEmptied',
    };
  },
  reply: async (event) => {
    const form = await event.request.formData();
    try {
      await adminFor(event).comments.reply(
        text(form, 'id'),
        text(form, 'body'),
      );
    } catch (caught) {
      return failFrom(caught);
    }
    return { notice: 'commentReplied' };
  },
  edit: async (event) => {
    const form = await event.request.formData();
    try {
      await adminFor(event).comments.update(text(form, 'id'), {
        authorName: text(form, 'authorName'),
        authorEmail: text(form, 'authorEmail'),
        authorUrl: text(form, 'authorUrl'),
        body: text(form, 'body'),
      });
    } catch (caught) {
      return failFrom(caught);
    }
    return { notice: 'saved' };
  },
};
