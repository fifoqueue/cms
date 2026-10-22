import {
  commentBulkSchema,
  commentInputSchema,
  commentListQuerySchema,
  commentReplySchema,
  commentUpdateSchema,
  discussionSettingsSchema,
  publicCommentSchema,
} from '@cms/sdk';
import type {
  Capability,
  AdminComment,
  CommentCounts,
  CommentStatus,
  CommentSubmitted,
  DiscussionSettings,
  PublicComment,
  PublicCommentPage,
} from '@cms/sdk';
import { PAGINATION_MAX_PAGE } from '@cms/sdk';
import { can } from '@cms/sdk/capabilities';
import type { CommentDraft, PluginComment } from '@cms/sdk/plugin';
import { z } from 'zod';
import type { Actor } from '#api/domain/auth/authorization';
import { authorize } from '#api/domain/auth/authorization';
import type {
  CommentRecord,
  CommentRepository,
  CommentTarget,
} from '#api/domain/comments/ports';
import type { ContentTypeService } from '#api/domain/content/content-types';
import { templates } from '#api/domain/email/templates';
import type { EmailService } from '#api/domain/email/email-service';
import type { Clock, HookDispatcher, IdGenerator } from '#api/domain/ports';
import type {
  Attempt,
  ProtectionService,
} from '#api/domain/security/protection-service';
import type { SettingsRepository } from '#api/domain/site/site-service';
import type { UserDirectory } from '#api/domain/users/user-directory';
import { forbidden, invalidInput, notFound, Errors } from '#api/shared/errors';
import { parseInput } from '#api/shared/validation';

const KEY = 'discussion';
const DAY = 24 * 60 * 60 * 1000;
/** Spam and trashed comments are deleted after this long (WordPress empties them after 30 days). */
export const COMMENT_PURGE_DAYS = 30;

/** What a `comment.beforeSave` filter may return: the draft with a valid body and status. */
const draftSchema = z.object({
  body: z.string().trim().min(1).max(5000),
  status: z.enum(['pending', 'approved', 'spam']),
});

const links = (text: string) => (text.match(/https?:\/\//gi) ?? []).length;

const toPlugin = (record: CommentRecord): PluginComment => ({
  id: record.id,
  contentId: record.contentId,
  parentId: record.parentId,
  authorName: record.authorName,
  authorEmail: record.authorEmail,
  authorUrl: record.authorUrl,
  body: record.body,
  status: record.status,
  createdAt: record.createdAt.toISOString(),
});

const toAdmin = (
  record: CommentRecord & { contentTitle: string },
): AdminComment => ({
  id: record.id,
  contentId: record.contentId,
  contentTitle: record.contentTitle,
  parentId: record.parentId,
  userId: record.userId,
  authorName: record.authorName,
  authorEmail: record.authorEmail,
  authorUrl: record.authorUrl,
  body: record.body,
  status: record.status,
  createdAt: record.createdAt.toISOString(),
  updatedAt: record.updatedAt.toISOString(),
});

export interface CommentServiceDeps {
  repository: CommentRepository;
  settings: SettingsRepository;
  types: Pick<ContentTypeService, 'list'>;
  protection: Pick<ProtectionService, 'check'>;
  hooks: HookDispatcher;
  email: Pick<EmailService, 'enabled' | 'queue'>;
  roles?: {
    capabilities(role: string): Promise<Capability[]>;
  };
  users: Pick<UserDirectory, 'list' | 'get'>;
  /** Public origin and display settings for notification mail. */
  site: () => Promise<{ siteUrl: string; title: string; locale: string }>;
  ids: IdGenerator;
  clock: Clock;
}

/** Comments: visitors' submissions, public threads and moderation (WordPress "Comments"). */
export class CommentService {
  constructor(private readonly deps: CommentServiceDeps) {}

  async discussion(): Promise<DiscussionSettings> {
    const result = discussionSettingsSchema.safeParse(
      await this.deps.settings.get(KEY),
    );
    return result.success ? result.data : discussionSettingsSchema.parse({});
  }

  async updateDiscussion(input: unknown, actor: Actor) {
    authorize(actor, 'settings.manage');
    const settings = parseInput(discussionSettingsSchema, input);
    await this.deps.settings.set(KEY, settings);
    return settings;
  }

  /** Approved comments of a public entry; `not_found` for anything else. */
  async publicPage(
    contentId: string,
    page: number,
  ): Promise<PublicCommentPage> {
    const target = await this.deps.repository.target(contentId);
    if (!target) throw notFound(Errors.ContentNotFound);
    const settings = await this.discussion();
    const current =
      Number.isSafeInteger(page) && page > 0
        ? Math.min(page, PAGINATION_MAX_PAGE)
        : 1;
    const { items, total, truncated } = await this.deps.repository.thread(
      contentId,
      current,
      settings.pageSize,
      settings.threadDepth,
    );
    return {
      items: items.map((item) => this.toPublic(item, target, item.depth)),
      total,
      count: target.commentCount,
      page: current,
      pageSize: settings.pageSize,
      open: await this.open(target, settings),
      threadDepth: settings.threadDepth,
      truncated,
    };
  }

  /**
   * A visitor's comment. Rate limits and captcha apply first; a filled honeypot is accepted
   * silently and stored nowhere. Spam and held comments both answer `pending`.
   */
  async submit(
    input: unknown,
    attempt: Omit<Attempt, 'action' | 'account'>,
  ): Promise<CommentSubmitted> {
    const data = parseInput(commentInputSchema, input);
    const protectedAttempt = { ...attempt, action: 'comment' as const };
    await this.deps.protection.check(protectedAttempt);
    if (data.website) return { status: 'pending', comment: null };

    const target = await this.deps.repository.target(data.contentId);
    if (!target) throw notFound(Errors.ContentNotFound);
    const settings = await this.discussion();
    if (!(await this.open(target, settings)))
      throw forbidden(Errors.CommentsClosed);
    const depth = await this.replyDepth(data.parentId, target, settings);

    const draft: CommentDraft = {
      contentId: target.id,
      parentId: data.parentId,
      authorName: data.authorName,
      authorEmail: data.authorEmail,
      authorUrl: data.authorUrl,
      body: data.body,
      status: await this.initialStatus(data, settings),
    };
    const filtered = await this.deps.hooks.applyFilter(
      'comment.beforeSave',
      draft,
      (value) => draftSchema.safeParse(value).success,
    );
    // Plugins decide the text and the verdict only; who wrote it and where stays as sent.
    const { body, status } = draftSchema.parse(filtered);
    const now = this.deps.clock.now();
    const record: CommentRecord = {
      ...draft,
      id: this.deps.ids.next(),
      userId: null,
      body,
      status,
      createdAt: now,
      updatedAt: now,
    };
    await this.deps.repository.insert(record);
    void this.deps.hooks.emit('comment.created', toPlugin(record));
    void this.notify(record, target, settings).catch(() => undefined);
    return status === 'approved'
      ? {
          status: 'approved',
          comment: this.toPublic(record, target, depth),
        }
      : { status: 'pending', comment: null };
  }

  /** Newest approved comments on public entries, for the recent comments widget. */
  recent(limit: number) {
    return this.deps.repository.recent(limit);
  }

  async list(query: unknown, actor: Actor) {
    authorize(actor, 'comments.moderate');
    const criteria = parseInput(commentListQuerySchema, query);
    const { items, total } = await this.deps.repository.list(criteria);
    return {
      items: items.map(toAdmin),
      total,
      page: criteria.page,
      pageSize: criteria.pageSize,
    };
  }

  async counts(actor: Actor): Promise<CommentCounts> {
    authorize(actor, 'comments.moderate');
    return this.deps.repository.counts();
  }

  async update(id: string, input: unknown, actor: Actor) {
    authorize(actor, 'comments.moderate');
    const changes = parseInput(commentUpdateSchema, input);
    const result = await this.deps.repository.update(
      id,
      changes,
      this.deps.clock.now(),
    );
    if (!result) throw notFound(Errors.CommentNotFound);
    this.statusChanged(result.before, result.after.status);
  }

  /** A moderator's reply, approved at once and marked as theirs. */
  async reply(id: string, input: unknown, actor: Actor) {
    authorize(actor, 'comments.moderate');
    const { body } = parseInput(commentReplySchema, input);
    const parent = await this.deps.repository.findById(id);
    if (!parent) throw notFound(Errors.CommentNotFound);
    const user = await this.deps.users.get(actor.id);
    if (!user) throw notFound(Errors.UserNotFound);
    const now = this.deps.clock.now();
    const record: CommentRecord = {
      id: this.deps.ids.next(),
      contentId: parent.contentId,
      parentId: parent.id,
      userId: user.id,
      authorName: user.name,
      authorEmail: user.email,
      authorUrl: '',
      body,
      status: 'approved',
      createdAt: now,
      updatedAt: now,
    };
    await this.deps.repository.insert(record);
    // Replying approves the comment answered, as in WordPress.
    if (parent.status === 'pending')
      await this.bulk({ ids: [parent.id], action: 'approve' }, actor);
    void this.deps.hooks.emit('comment.created', toPlugin(record));
  }

  async bulk(input: unknown, actor: Actor) {
    authorize(actor, 'comments.moderate');
    const { ids, action } = parseInput(commentBulkSchema, input);
    if (action === 'delete') {
      await this.deps.repository.delete(ids);
      return;
    }
    const status = (
      {
        approve: 'approved',
        unapprove: 'pending',
        spam: 'spam',
        trash: 'trash',
      } as const
    )[action];
    const changed = await this.deps.repository.setStatus(
      ids,
      status,
      this.deps.clock.now(),
    );
    for (const before of changed) this.statusChanged(before, status);
  }

  async remove(id: string, actor: Actor) {
    authorize(actor, 'comments.moderate');
    const [deleted] = await this.deps.repository.delete([id]);
    if (!deleted) throw notFound(Errors.CommentNotFound);
  }

  /** Deletes spam and trash older than `COMMENT_PURGE_DAYS`. */
  async purge() {
    const before = new Date(
      this.deps.clock.now().getTime() - COMMENT_PURGE_DAYS * DAY,
    );
    while ((await this.deps.repository.purge(before, 500)) === 500);
  }

  private statusChanged(before: CommentRecord, status: CommentStatus) {
    if (before.status === status) return;
    void this.deps.hooks.emit('comment.statusChanged', {
      ...toPlugin({ ...before, status }),
      previousStatus: before.status,
    });
  }

  /** Open when discussion is on, the type and entry allow comments, and it is not too old. */
  private async open(target: CommentTarget, settings: DiscussionSettings) {
    if (!settings.enabled || !target.allowComments) return false;
    const type = (await this.deps.types.list()).find(
      (option) => option.key === target.type,
    );
    if (!type?.supports.comments) return false;
    if (!settings.closeAfterDays || !target.publishedAt) return true;
    return (
      this.deps.clock.now().getTime() - target.publishedAt.getTime() <
      settings.closeAfterDays * DAY
    );
  }

  /** The depth of a new comment; replies must answer a shown, approved comment of the entry. */
  private async replyDepth(
    parentId: string | null,
    target: CommentTarget,
    settings: DiscussionSettings,
  ) {
    let depth = 0;
    for (let id = parentId; id; depth += 1) {
      const parent = await this.deps.repository.findById(id);
      if (
        !parent ||
        parent.contentId !== target.id ||
        parent.status !== 'approved' ||
        depth + 1 >= settings.threadDepth
      )
        throw invalidInput(Errors.CommentReplyInvalid, [
          { path: 'parentId', message: Errors.CommentReplyInvalid },
        ]);
      id = parent.parentId;
    }
    return depth;
  }

  private async initialStatus(
    data: {
      authorName: string;
      authorEmail: string;
      authorUrl: string;
      body: string;
    },
    settings: DiscussionSettings,
  ): Promise<CommentDraft['status']> {
    const text = [data.authorName, data.authorEmail, data.authorUrl, data.body]
      .join('\n')
      .toLowerCase();
    if (settings.blockWords.some((word) => text.includes(word))) return 'spam';
    if (
      settings.holdWords.some((word) => text.includes(word)) ||
      links(data.body) > settings.maxLinks
    )
      return 'pending';
    if (settings.moderation === 'auto') return 'approved';
    if (settings.moderation === 'manual') return 'pending';
    return (await this.deps.repository.hasApproved(data.authorEmail))
      ? 'approved'
      : 'pending';
  }

  private toPublic(
    record: CommentRecord,
    target: CommentTarget,
    depth: number,
  ): PublicComment {
    return publicCommentSchema.parse({
      id: record.id,
      parentId: record.parentId,
      depth,
      authorName: record.authorName,
      authorUrl: record.authorUrl || null,
      byAuthor: record.userId !== null && record.userId === target.authorId,
      body: record.body,
      createdAt: record.createdAt.toISOString(),
    });
  }

  /** Mail about a new comment: moderators when it waits, the entry's author when it is shown. */
  private async notify(
    record: CommentRecord,
    target: CommentTarget,
    settings: DiscussionSettings,
  ) {
    if (record.status === 'spam' || !(await this.deps.email.enabled())) return;
    const site = await this.deps.site();
    const copy = templates(site.locale);
    if (record.status === 'pending' && settings.notifyModerators) {
      const link = site.siteUrl
        ? `${site.siteUrl}/admin/comments?status=pending`
        : '';
      const users = await this.deps.users.list();
      const moderators = (
        await Promise.all(
          users.map(async (user) => ({
            user,
            allowed: can(
              {
                role: user.role,
                capabilities: await this.deps.roles?.capabilities(user.role),
              },
              'comments.moderate',
            ),
          })),
        )
      )
        .filter((item) => item.allowed)
        .map((item) => item.user);
      for (const user of moderators)
        await this.deps.email.queue({
          to: user.email,
          ...copy.commentPending(site.title, target.title, record, link),
        });
    }
    if (record.status === 'approved' && settings.notifyAuthors) {
      const author = await this.deps.users.get(target.authorId);
      if (!author || author.email === record.authorEmail) return;
      const link = site.siteUrl
        ? `${site.siteUrl}${target.path}#comment-${record.id}`
        : '';
      await this.deps.email.queue({
        to: author.email,
        ...copy.commentApproved(site.title, target.title, record, link),
      });
    }
  }
}
