import { COMMENT_BULK_ACTIONS, COMMENT_STATUSES } from '@cms/sdk';
import type { CommentStatus } from '@cms/sdk';
import { failFrom, text } from '#lib/server/errors.js';
import { adminFor, requireCapability } from '#lib/server/session.js';
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
  const [comments, counts] = await Promise.all([
    admin.comments.list({ status, search, contentId, page, pageSize: 20 }),
    admin.comments.counts(),
  ]);
  return {
    filter: { status, q: search, contentId },
    counts,
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
    return { notice: 'saved' };
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
