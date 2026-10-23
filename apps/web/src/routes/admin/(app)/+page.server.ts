import { redirect } from '@sveltejs/kit';
import { COMMENT_BULK_ACTIONS } from '@cms/sdk';
import { can } from '@cms/sdk/capabilities';
import { failFrom, text } from '#lib/server/errors.js';
import { adminFor } from '#lib/server/session.js';
import type { Actions, PageServerLoad } from './$types';

/** Totals only: one-item pages carry the count without the entries. */
const total = (page: Promise<{ total: number }>) =>
  page.then(
    (result) => result.total,
    () => null,
  );

/** The dashboard: what is published, what waits, and the user's latest drafts. */
export const load: PageServerLoad = async (event) => {
  const admin = adminFor(event);
  const user = event.locals.user!;
  if (!can(user, 'content.create')) redirect(303, '/admin/account');
  const moderates = can(user, 'comments.moderate');
  const model = await admin.contentModel.model();
  /** By publication time: the next scheduled first, the latest published first. */
  const entries = (status: 'scheduled' | 'published') =>
    admin.content
      .list({
        status,
        orderBy: 'publishedAt',
        order: status === 'scheduled' ? 'asc' : 'desc',
        pageSize: 5,
      })
      .then((page) =>
        page.items.map(({ id, title, publishedAt }) => ({
          id,
          title,
          publishedAt,
        })),
      )
      .catch(() => []);
  const [
    published,
    drafts,
    pending,
    scheduled,
    myDrafts,
    counts,
    comments,
    soon,
    recent,
    approved,
    health,
  ] = await Promise.all([
    Promise.all(
      model.types.map(async (type) => ({
        key: type.key,
        name: type.pluralName,
        count: await total(
          admin.content.list({
            type: type.key,
            status: 'published',
            pageSize: 1,
          }),
        ),
      })),
    ),
    total(admin.content.list({ status: 'draft', pageSize: 1 })),
    total(admin.content.list({ status: 'pending', pageSize: 1 })),
    total(admin.content.list({ status: 'scheduled', pageSize: 1 })),
    admin.content
      .list({ status: 'draft', author: user.slug, pageSize: 5 })
      .then((page) => page.items)
      .catch(() => []),
    moderates ? admin.comments.counts().catch(() => null) : null,
    moderates
      ? admin.comments
          .list({ status: 'pending', pageSize: 5 })
          .then((page) => page.items)
          .catch(() => [])
      : [],
    entries('scheduled'),
    entries('published'),
    moderates
      ? admin.comments
          .list({ status: 'approved', pageSize: 5 })
          .then((page) => page.items)
          .catch(() => [])
      : [],
    can(user, 'tools.manage')
      ? admin
          .health()
          .then(({ checks }) => ({
            critical: checks.filter((check) => check.status === 'critical')
              .length,
            recommended: checks.filter(
              (check) => check.status === 'recommended',
            ).length,
          }))
          .catch(() => null)
      : null,
  ]);
  const comment = ({
    id,
    authorName,
    body,
    contentId,
    contentTitle,
  }: (typeof comments)[number]) => ({
    id,
    authorName,
    body: body.slice(0, 200),
    contentId,
    contentTitle,
  });
  return {
    published,
    drafts,
    pending,
    scheduled,
    myDrafts: myDrafts.map(({ id, title, updatedAt }) => ({
      id,
      title,
      updatedAt,
    })),
    comments: counts && {
      pending: counts.pending,
      approved: counts.approved,
      recent: comments.map(comment),
      approvedRecent: approved.map(comment),
    },
    activity: { soon, recent },
    health,
  };
};

export const actions: Actions = {
  /** Approve, spam or trash one comment waiting for moderation. */
  moderate: async (event) => {
    const form = await event.request.formData();
    const action = COMMENT_BULK_ACTIONS.find(
      (option) => option !== 'delete' && option === text(form, 'action'),
    );
    if (!action) return {};
    try {
      await adminFor(event).comments.bulk({ ids: [text(form, 'id')], action });
    } catch (caught) {
      return failFrom(caught);
    }
    return { notice: 'saved' };
  },
  /** Saves a quick draft post from a title and plain text. */
  draft: async (event) => {
    const form = await event.request.formData();
    const body = text(form, 'body').trim();
    try {
      await adminFor(event).content.create({
        type: 'post',
        title: text(form, 'title'),
        document: {
          type: 'doc',
          content: body
            ? body.split(/\n{2,}/).map((paragraph) => ({
                type: 'paragraph',
                content: [{ type: 'text', text: paragraph }],
              }))
            : [{ type: 'paragraph' }],
        },
      });
    } catch (caught) {
      return failFrom(caught);
    }
    return { notice: 'draftSaved' };
  },
};
