import {
  commentPushPayloadSchema,
  commentPushSchema,
  commentUnsubscribeSchema,
  isPushEndpoint,
  pushRenewSchema,
  userPushRemovalSchema,
  userPushSchema,
} from '@cms/sdk';
import type {
  CommentNoticeChannel,
  CommentPushPayload,
  CommentUnsubscribed,
  DiscussionSettings,
  PublicCommentPage,
  RateRule,
} from '@cms/sdk';
import { z } from 'zod';
import type {
  CommentRecord,
  CommentRepository,
  CommentTarget,
} from '#api/domain/comments/ports';
import type {
  CommentNoticeState,
  NoticeItem,
  NoticeOutbox,
  PushInvalidReason,
  PushSender,
  PushSubscriptionRecord,
  PushSubscriptionRepository,
  QueuedJob,
} from '#api/domain/comments/notification-ports';
import type { VapidKeys } from '#api/domain/comments/vapid-keys';
import type { EmailMessage } from '#api/domain/email/ports';
import type { EmailService } from '#api/domain/email/email-service';
import { templates } from '#api/domain/email/templates';
import { PermanentJobError } from '#api/domain/jobs/job-runner';
import type { SealedJobs } from '#api/domain/jobs/sealed-jobs';
import type {
  Clock,
  HookDispatcher,
  IdGenerator,
  Signer,
} from '#api/domain/ports';
import type { RateLimitStore } from '#api/domain/security/ports';
import type { UserDirectory } from '#api/domain/users/user-directory';
import { Errors, invalidInput, rateLimited } from '#api/shared/errors';
import type { Logger } from '#api/shared/logger';
import { parseInput } from '#api/shared/validation';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Job kinds handled by `CommentNotifier`: the fan-out queued with the claim, one mail or one
 * push per recipient browser, and the end-of-window collection of held notices.
 */
export const COMMENT_NOTICE_JOB = 'comment.notice';
export const COMMENT_MAIL_JOB = 'comment.mail';
export const COMMENT_PUSH_JOB = 'comment.push';
export const COMMENT_SUMMARY_JOB = 'comment.summary';
/** Queued notification work expires after this long (the job queue's usual retention). */
const JOB_LIFETIME_MS = 7 * DAY;
/** Dispatch keys are kept this long, so a retried fan-out never sends twice. */
const DISPATCH_RETENTION_MS = 30 * DAY;

/**
 * Flood valve, per recipient and channel: past `NOTICE_FLOOD_LIMIT` notices within
 * `NOTICE_FLOOD_WINDOW_MS`, the rest wait for one summary sent when the window ends. Nothing
 * is dropped; the summary counts every held notice.
 */
export const NOTICE_FLOOD_LIMIT = 30;
export const NOTICE_FLOOD_WINDOW_MS = HOUR;
/** Pushes in one `tag` within this window replace each other and count as "+N more". */
export const PUSH_TAG_WINDOW_MS = HOUR;
/** How long a push service keeps an undelivered message. */
export const PUSH_TTL_SECONDS = 24 * 60 * 60;
/** Lifetime of `pushToken` in a submission answer. */
export const PUSH_TOKEN_MS = HOUR;
/** Lifetime of unsubscribe links in reply emails. */
export const UNSUBSCRIBE_MS = 180 * DAY;
/** Registrations kept per comment and per user; the least recently seen beyond go. */
export const PUSH_COMMENT_CAP = 5;
export const PUSH_USER_CAP = 10;
/** A registration not renewed for this long is invalidated by the daily check. */
export const PUSH_STALE_DAYS = 120;
/** Invalidated registrations are deleted after this long. */
export const PUSH_PURGE_DAYS = 30;
/** Registration, renewal and unsubscribe writes per client (or user). */
const PUSH_WRITE_RULE: RateRule = {
  enabled: true,
  max: 20,
  windowSeconds: 600,
  blockSeconds: 600,
  enforcement: 'block',
};

const subjectsSchema = z.array(z.string().max(191)).max(100);
const idSchema = z.string().min(1).max(36);
const tagSchema = z.string().min(1).max(64);

/**
 * Whose eligibility a delivery re-checks right before it goes out: the parent comment (and its
 * signed-in author) for replies, the user for entry authors.
 */
const recipientSchema = z.discriminatedUnion('audience', [
  z.object({
    audience: z.literal('reply'),
    commentId: idSchema,
    userId: idSchema.nullable(),
  }),
  z.object({ audience: z.literal('author'), userId: idSchema }),
]);

type Recipient = z.output<typeof recipientSchema>;

/** What a notice says; its copy is rendered in the site language when it is sent. */
const contentSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.enum(['reply', 'comment']),
    /** The announced comment; it must still be approved and not erased when the notice is sent. */
    commentId: idSchema,
    name: z.string(),
    body: z.string(),
    title: z.string(),
    link: z.url(),
  }),
  z.object({
    kind: z.literal('summary'),
    count: z.number().int().positive(),
    link: z.url(),
  }),
]);

type Content = z.output<typeof contentSchema>;

const noticeJobSchema = z.object({
  subjects: subjectsSchema,
  commentId: idSchema,
});

const mailJobSchema = z.object({
  subjects: subjectsSchema,
  to: z.email(),
  recipient: recipientSchema,
  content: contentSchema,
});

const pushJobSchema = z.object({
  subjects: subjectsSchema,
  subscriptionId: idSchema,
  recipient: recipientSchema,
  tag: tagSchema,
  /** Earlier pushes of `tag` this one replaces on screen. */
  others: z.number().int().min(0),
  content: contentSchema,
});

const summaryJobSchema = z.object({
  subjects: subjectsSchema,
  /** The flood window holding the notices. */
  window: z.string().min(1),
  channel: z.enum(['email', 'push']),
  recipient: recipientSchema,
  to: z.email().nullable(),
  tag: tagSchema.nullable(),
  link: z.url(),
});

type Owner = { commentId: string | null; userId: string | null };

/**
 * Why a queued notice did not go out (logged with how many notices it stood for). `withdrawn`:
 * the announced comment was unapproved, trashed, deleted or erased since it was queued.
 */
type Refusal = 'disabled' | 'recipient' | 'unsubscribed' | 'withdrawn';

/** Plain text for a push body: whitespace collapsed, at most 140 UTF-16 units. */
export const excerpt = (text: string) => {
  const plain = text.replace(/\s+/g, ' ').trim();
  return plain.length <= 140
    ? plain
    : `${plain.slice(0, 139).replace(/[\uD800-\uDBFF]$/, '')}…`;
};

const sameAuthor = (a: CommentRecord, b: CommentRecord) =>
  (!!a.authorEmail && a.authorEmail === b.authorEmail) ||
  (!!a.userId && a.userId === b.userId);

type Subscription = z.output<typeof userPushSchema>['subscription'];

const keysOf = (subscription: Subscription) => ({
  endpoint: subscription.endpoint,
  p256dh: subscription.keys.p256dh,
  auth: subscription.keys.auth,
  expiresAt:
    typeof subscription.expirationTime === 'number'
      ? new Date(subscription.expirationTime)
      : null,
});

/** One browser per exact endpoint, whether reached through a comment or its user. */
const distinct = (rows: readonly PushSubscriptionRecord[]) => [
  ...new Map(rows.map((row) => [row.endpoint, row] as const)).values(),
];

export interface CommentNotifierDeps {
  comments: Pick<CommentRepository, 'findById' | 'target'>;
  state: CommentNoticeState;
  subscriptions: PushSubscriptionRepository;
  outbox: NoticeOutbox;
  keys: Pick<VapidKeys, 'publicKey' | 'pair'>;
  sender: PushSender;
  email: Pick<EmailService, 'enabled' | 'queue' | 'sendNow'>;
  jobs: Pick<SealedJobs, 'seal' | 'open'>;
  logger: Pick<Logger, 'info'>;
  limits: Pick<RateLimitStore, 'hit'>;
  hooks: HookDispatcher;
  signer: Signer;
  users: Pick<UserDirectory, 'get' | 'list'>;
  /** `icon`: the site icon's URL (absolute or site-relative), if any. */
  site: () => Promise<{
    siteUrl: string;
    title: string;
    locale: string;
    icon?: string | null;
  }>;
  discussion: () => Promise<DiscussionSettings>;
  ids: IdGenerator;
  clock: Clock;
}

/**
 * Who hears about an approved comment: the entry's author (email and their browsers) and, for
 * a reply, the parent comment's author (email automatically, push when registered). Every
 * comment is announced once, never to its own author, and floods collapse into one summary.
 */
export class CommentNotifier {
  constructor(private readonly deps: CommentNotifierDeps) {}

  /** What a public comment page tells the viewer about notifications. */
  async offer(
    settings: DiscussionSettings,
    viewer: boolean,
  ): Promise<PublicCommentPage['notifications']> {
    const site = await this.deps.site();
    if (!site.siteUrl) return { email: false, push: null };
    return {
      email:
        settings.notifyCommenters &&
        (settings.showEmail || viewer) &&
        (await this.deps.email.enabled()),
      push: settings.pushNotifications
        ? await this.deps.keys.publicKey()
        : null,
    };
  }

  /** `GET /api/v1/admin/push-subscription`: the key editors' browsers subscribe with. */
  async publicKey(): Promise<{ publicKey: string | null }> {
    return {
      publicKey: (await this.deps.discussion()).pushNotifications
        ? await this.deps.keys.publicKey()
        : null,
    };
  }

  /** The token a visitor's browser registers with; issued for every verdict so none is revealed. */
  pushToken(record: CommentRecord) {
    return this.token('comment-push', [record.id], PUSH_TOKEN_MS);
  }

  /** A signed link token that stops one channel: a comment's reply mail or one push registration. */
  unsubscribeToken(channel: CommentNoticeChannel, id: string) {
    return this.token('comment-unsubscribe', [channel, id], UNSUBSCRIBE_MS);
  }

  /** Moderator mail about held comments, queued as plugins shape it; the recipient is fixed. */
  async notice(input: EmailMessage) {
    await this.deps.email.queue(await this.shaped(input));
  }

  /**
   * Claims an approved comment's announcement and queues its fan-out in one transaction, so a
   * failure leaves it unclaimed (the caller sees the error; repeating the approval claims again).
   */
  async claim(record: CommentRecord) {
    if (record.status !== 'approved') return false;
    return this.deps.state.claim(
      { id: record.id, contentId: record.contentId },
      this.deps.clock.now(),
      this.job(COMMENT_NOTICE_JOB, {
        subjects: [
          record.id,
          record.authorEmail,
          ...(record.userId ? [record.userId] : []),
        ].filter(Boolean),
        commentId: record.id,
      }),
    );
  }

  /**
   * The job handler for `COMMENT_NOTICE_JOB`: resolves who hears about the comment and queues one
   * delivery per recipient, at most once per comment (a retry after a crash queues nothing new).
   * A comment unapproved since its claim is released, so a later approval announces it.
   */
  async deliverNotice(payload: unknown) {
    const { commentId } = this.deps.jobs.open(payload, noticeJobSchema);
    let record = await this.deps.comments.findById(commentId);
    if (record && record.status !== 'approved') {
      if (await this.deps.state.release(commentId)) return;
      record = await this.deps.comments.findById(commentId);
    }
    if (record?.status !== 'approved') return;
    const target = await this.deps.comments.target(record.contentId);
    if (!target) return;
    await this.deps.outbox.dispatch(
      `notice:${record.id}`,
      this.deps.clock.now(),
      { items: await this.plan(record, target) },
    );
  }

  private async shaped(input: EmailMessage): Promise<EmailMessage> {
    const schema = z.object({
      to: z.literal(input.to),
      subject: z
        .string()
        .min(1)
        .max(998)
        .regex(/^[^\r\n]+$/),
      text: z.string().min(1).max(100000),
    });
    const output = schema.parse(
      await this.deps.hooks.applyFilter(
        'comment.notification',
        schema.parse({
          to: input.to,
          subject: input.subject,
          text: input.text,
        }),
        (value) => schema.safeParse(value).success,
      ),
    );
    return { ...input, ...output };
  }

  /** The recipients of an approved comment, each with its delivery jobs. */
  private async plan(
    record: CommentRecord,
    target: CommentTarget,
  ): Promise<NoticeItem[]> {
    const [settings, site] = await Promise.all([
      this.deps.discussion(),
      this.deps.site(),
    ]);
    // Links (and unsubscribe links) must be absolute.
    if (!site.siteUrl) return [];
    const entry = `${site.siteUrl}${target.path}`;
    const link = `${entry}#comment-${record.id}`;
    const comments = `${site.siteUrl}/admin/comments`;
    const parent = record.parentId
      ? await this.deps.comments.findById(record.parentId)
      : null;
    const replyTo =
      parent?.status === 'approved' && !sameAuthor(parent, record)
        ? parent
        : null;
    const author = await this.deps.users.get(target.authorId);
    const notified =
      author &&
      author.email !== record.authorEmail &&
      author.id !== record.userId
        ? author
        : null;
    // The entry's author answered by a reply gets only the reply notice.
    const authorAnswered =
      !!notified &&
      !!replyTo &&
      (replyTo.userId === notified.id ||
        replyTo.authorEmail === notified.email);
    const subjects = [
      record.id,
      record.authorEmail,
      ...(record.userId ? [record.userId] : []),
    ].filter(Boolean);
    const mail = await this.deps.email.enabled();
    const said = {
      commentId: record.id,
      name: record.authorName,
      body: record.body,
    };
    const items: NoticeItem[] = [];

    const reply: Recipient | null = replyTo && {
      audience: 'reply',
      commentId: replyTo.id,
      userId: replyTo.userId,
    };
    const replySubjects = replyTo
      ? [...subjects, replyTo.id, ...(replyTo.userId ? [replyTo.userId] : [])]
      : subjects;
    const replyContent: Content = {
      kind: 'reply',
      ...said,
      title: target.title,
      link,
    };
    let replyMailed = false;
    if (
      replyTo &&
      reply &&
      mail &&
      settings.notifyCommenters &&
      replyTo.authorEmail &&
      (await this.deps.state.replyMail(replyTo.id))
    ) {
      replyMailed = true;
      items.push(
        this.mailItem(
          replyTo.authorEmail,
          reply,
          replyContent,
          entry,
          replySubjects,
        ),
      );
    }
    const writer: Recipient | null = notified && {
      audience: 'author',
      userId: notified.id,
    };
    const authorContent: Content = {
      kind: 'comment',
      ...said,
      title: target.title,
      link,
    };
    if (
      notified &&
      writer &&
      mail &&
      settings.notifyAuthors &&
      !(authorAnswered && replyMailed)
    )
      items.push(
        this.mailItem(notified.email, writer, authorContent, comments, [
          ...subjects,
          notified.id,
        ]),
      );

    if (!settings.pushNotifications) return items;
    let replyPushed = false;
    if (replyTo && reply) {
      const browsers = await this.browsers(reply);
      replyPushed = browsers.length > 0;
      if (replyPushed)
        items.push(
          this.pushItem(
            `push:${replyTo.userId ? `user:${replyTo.userId}` : `comment:${replyTo.id}`}`,
            browsers,
            reply,
            `comment-${replyTo.id}`,
            replyContent,
            entry,
            replySubjects,
          ),
        );
    }
    if (notified && writer && !(authorAnswered && replyPushed)) {
      const browsers = await this.browsers(writer);
      if (browsers.length)
        items.push(
          this.pushItem(
            `push:user:${notified.id}`,
            browsers,
            writer,
            `entry-${target.id}`,
            authorContent,
            comments,
            [...subjects, notified.id],
          ),
        );
    }
    return items;
  }

  /** `POST /api/v1/comments/push`. Disabled push or a hidden comment is accepted silently. */
  async registerVisitor(input: unknown, client: string | null) {
    await this.limit(`client:${client ?? 'unproven'}`);
    const { token, subscription } = parseInput(commentPushSchema, input);
    const [commentId] = this.verify('comment-push', token, 1) ?? [];
    if (!commentId)
      throw invalidInput(Errors.CommentPushTokenInvalid, [
        { path: 'token', message: Errors.CommentPushTokenInvalid },
      ]);
    const [settings, comment] = await Promise.all([
      this.deps.discussion(),
      this.deps.comments.findById(commentId),
    ]);
    if (
      settings.pushNotifications &&
      (comment?.status === 'approved' || comment?.status === 'pending')
    )
      await this.save(
        { commentId, userId: null },
        subscription,
        PUSH_COMMENT_CAP,
      );
    return { ok: true as const };
  }

  /** `PUT /api/v1/admin/push-subscription`: a browser of the signed-in user. */
  async saveForUser(userId: string, input: unknown) {
    await this.limit(`user:${userId}`);
    const { subscription } = parseInput(userPushSchema, input);
    await this.save({ commentId: null, userId }, subscription, PUSH_USER_CAP);
    return { ok: true as const };
  }

  async removeForUser(userId: string, input: unknown) {
    await this.limit(`user:${userId}`);
    const { endpoint } = parseInput(userPushRemovalSchema, input);
    await this.deps.subscriptions.removeForUser(userId, endpoint);
  }

  /**
   * `POST /api/v1/push/renew`: the old subscription's endpoint and auth secret prove possession.
   * Unknown endpoints and wrong secrets answer the same and change nothing (no enumeration).
   */
  async renew(input: unknown, client: string | null) {
    await this.limit(`client:${client ?? 'unproven'}`);
    const { old, subscription } = parseInput(pushRenewSchema, input);
    await this.deps.subscriptions.renew(
      old,
      keysOf(subscription),
      this.deps.clock.now(),
    );
    return { ok: true as const };
  }

  /** `POST /api/v1/comments/unsubscribe`. Repeating a valid link succeeds again. */
  async unsubscribe(
    input: unknown,
    client: string | null,
  ): Promise<CommentUnsubscribed> {
    await this.limit(`client:${client ?? 'unproven'}`);
    const { token } = parseInput(commentUnsubscribeSchema, input);
    const [channel, id] = this.verify('comment-unsubscribe', token, 2) ?? [];
    if (!id || (channel !== 'email' && channel !== 'push'))
      throw invalidInput(Errors.CommentUnsubscribeInvalid, [
        { path: 'token', message: Errors.CommentUnsubscribeInvalid },
      ]);
    if (channel === 'email') await this.deps.state.muteReplyMail(id);
    else await this.deps.subscriptions.delete(id);
    return { channel };
  }

  /**
   * The daily check. Web Push has no silent probe, so it invalidates what can be known without
   * sending: passed `expirationTime`, endpoints outside the allowlist, and registrations not
   * renewed for `PUSH_STALE_DAYS`. Long-invalid rows and finished counters are deleted.
   */
  async validate() {
    const now = this.deps.clock.now();
    const stale = new Date(now.getTime() - PUSH_STALE_DAYS * DAY);
    for (let after: string | null = null; ;) {
      const rows = await this.deps.subscriptions.page(after, 500);
      const invalid = new Map<PushInvalidReason, string[]>();
      for (const row of rows) {
        const reason: PushInvalidReason | null = !isPushEndpoint(row.endpoint)
          ? 'endpoint'
          : row.expiresAt && row.expiresAt <= now
            ? 'expired'
            : row.lastSeenAt < stale
              ? 'stale'
              : null;
        if (reason)
          invalid.set(reason, [...(invalid.get(reason) ?? []), row.id]);
      }
      for (const [reason, ids] of invalid)
        await this.deps.subscriptions.invalidate(ids, reason, now);
      if (rows.length < 500) break;
      after = rows.at(-1)!.id;
    }
    await this.deps.subscriptions.purge(
      new Date(now.getTime() - PUSH_PURGE_DAYS * DAY),
    );
    await this.deps.outbox.purge(
      new Date(now.getTime() - DISPATCH_RETENTION_MS),
    );
  }

  /**
   * The job handler for `COMMENT_MAIL_JOB`. Eligibility is checked again right before sending:
   * a channel switched off, a changed recipient or an unsubscribe since queuing drops the notice
   * (logged with the number of notices it stood for). Transport failures retry.
   */
  async deliverMail(payload: unknown) {
    const job = this.deps.jobs.open(payload, mailJobSchema);
    const [settings, site] = await Promise.all([
      this.deps.discussion(),
      this.deps.site(),
    ]);
    const refusal =
      (await this.mailRefusal(job, settings, site.siteUrl)) ??
      (await this.withdrawn(job.content));
    if (refusal) return this.dropped('email', refusal, job.content);
    const copy = templates(site.locale);
    const unsubscribe =
      job.recipient.audience === 'reply'
        ? `${site.siteUrl}/comments/unsubscribe?token=${encodeURIComponent(this.unsubscribeToken('email', job.recipient.commentId))}`
        : '';
    const { content } = job;
    const message =
      content.kind === 'summary'
        ? copy.commentSummary(
            site.title,
            content.count,
            content.link,
            unsubscribe,
          )
        : content.kind === 'reply'
          ? copy.commentReply(
              site.title,
              content.title,
              { authorName: content.name, authorEmail: '', body: content.body },
              content.link,
              unsubscribe,
            )
          : copy.commentApproved(
              site.title,
              content.title,
              { authorName: content.name, authorEmail: '', body: content.body },
              content.link,
            );
    await this.deps.email.sendNow(
      await this.shaped({ to: job.to, subjects: job.subjects, ...message }),
    );
  }

  /**
   * The job handler for `COMMENT_PUSH_JOB`. The registration must still be active (unsubscribing
   * deletes it), push still on and the endpoint still allowed; the copy is rendered and filtered
   * here, then sent.
   */
  async deliverPush(payload: unknown) {
    const job = this.deps.jobs.open(payload, pushJobSchema);
    if (!(await this.deps.discussion()).pushNotifications)
      return this.dropped('push', 'disabled', job.content);
    const row = await this.deps.subscriptions.findById(job.subscriptionId);
    if (!row || row.status !== 'active')
      return this.dropped('push', 'unsubscribed', job.content);
    const withdrawn = await this.withdrawn(job.content);
    if (withdrawn) return this.dropped('push', withdrawn, job.content);
    const now = this.deps.clock.now();
    if (!isPushEndpoint(row.endpoint))
      return this.deps.subscriptions.invalidate([row.id], 'endpoint', now);
    if (row.expiresAt && row.expiresAt <= now)
      return this.deps.subscriptions.invalidate([row.id], 'expired', now);
    const status = await this.deps.sender.send(
      row,
      JSON.stringify(await this.pushPayload(job)),
      { subject: await this.subject(), ...(await this.deps.keys.pair()) },
      { ttl: PUSH_TTL_SECONDS, urgency: 'normal' },
    );
    if (status >= 200 && status < 300) return;
    if (status === 404 || status === 410)
      return this.deps.subscriptions.invalidate([row.id], 'gone', now);
    if (status === 401 || status === 403)
      return this.deps.subscriptions.invalidate([row.id], 'rejected', now);
    if (status === 429 || status >= 500)
      throw new Error(Errors.PushFailed(status));
    throw new PermanentJobError(Errors.PushFailed(status));
  }

  /**
   * The job handler for `COMMENT_SUMMARY_JOB`: moves the window's held count into one durable
   * summary delivery in the same transaction, so a failure keeps the count for the retry. With
   * push off or no browser left, the count is taken and the drop is logged.
   */
  async deliverSummary(payload: unknown) {
    const job = this.deps.jobs.open(payload, summaryJobSchema);
    const summary = (count: number): Content => ({
      kind: 'summary',
      count,
      link: job.link,
    });
    if (job.channel === 'email') {
      const to = job.to;
      if (to)
        await this.deps.outbox.collect(job.window, (count) => [
          this.job(COMMENT_MAIL_JOB, {
            subjects: job.subjects,
            to,
            recipient: job.recipient,
            content: summary(count),
          }),
        ]);
      return;
    }
    const enabled = (await this.deps.discussion()).pushNotifications;
    const tag = job.tag;
    const browsers = enabled && tag ? await this.browsers(job.recipient) : [];
    const count = await this.deps.outbox.collect(job.window, (held) =>
      browsers.map((row) =>
        this.pushJob(row, job.recipient, tag!, 0, summary(held), job.subjects),
      ),
    );
    if (count && !browsers.length)
      this.dropped(
        'push',
        enabled ? 'unsubscribed' : 'disabled',
        summary(count),
      );
  }

  /** A sealed job row; it expires `lifetime` after it is due. */
  private job<P extends { subjects: string[] }>(
    kind: string,
    payload: P,
    runAt?: Date,
    lifetime = JOB_LIFETIME_MS,
  ): QueuedJob {
    const due = runAt ?? this.deps.clock.now();
    return {
      kind,
      payload: this.deps.jobs.seal(payload),
      subjects: payload.subjects,
      ...(runAt && { runAt }),
      expiresAt: new Date(due.getTime() + lifetime),
    };
  }

  private pushJob(
    row: PushSubscriptionRecord,
    recipient: Recipient,
    tag: string,
    others: number,
    content: Content,
    subjects: string[],
  ) {
    return this.job(
      COMMENT_PUSH_JOB,
      {
        subjects,
        subscriptionId: row.id,
        recipient,
        tag,
        others,
        content,
      } satisfies z.input<typeof pushJobSchema>,
      undefined,
      PUSH_TTL_SECONDS * 1000,
    );
  }

  /** One mail recipient: admitted notices are mailed, a flood is summarised at the window's end. */
  private mailItem(
    to: string,
    recipient: Recipient,
    content: Content,
    summaryLink: string,
    subjects: string[],
  ): NoticeItem {
    const window = `email:${to}`;
    return {
      subjects,
      window: {
        key: window,
        limit: NOTICE_FLOOD_LIMIT,
        windowMs: NOTICE_FLOOD_WINDOW_MS,
      },
      deliver: () => [
        this.job(COMMENT_MAIL_JOB, {
          subjects,
          to,
          recipient,
          content,
        } satisfies z.input<typeof mailJobSchema>),
      ],
      collect: (windowEnd) =>
        this.job(
          COMMENT_SUMMARY_JOB,
          {
            subjects,
            window,
            channel: 'email',
            recipient,
            to,
            tag: null,
            link: summaryLink,
          } satisfies z.input<typeof summaryJobSchema>,
          windowEnd,
        ),
    };
  }

  /** One push recipient with its browsers; `tag` groups the thread on screen. */
  private pushItem(
    window: string,
    browsers: readonly PushSubscriptionRecord[],
    recipient: Recipient,
    tag: string,
    content: Content,
    summaryLink: string,
    subjects: string[],
  ): NoticeItem {
    return {
      subjects,
      window: {
        key: window,
        limit: NOTICE_FLOOD_LIMIT,
        windowMs: NOTICE_FLOOD_WINDOW_MS,
      },
      thread: { key: `${window}:${tag}`, windowMs: PUSH_TAG_WINDOW_MS },
      deliver: (others) =>
        browsers.map((row) =>
          this.pushJob(row, recipient, tag, others, content, subjects),
        ),
      collect: (windowEnd) =>
        this.job(
          COMMENT_SUMMARY_JOB,
          {
            subjects,
            window,
            channel: 'push',
            recipient,
            to: null,
            tag,
            link: summaryLink,
          } satisfies z.input<typeof summaryJobSchema>,
          windowEnd,
        ),
    };
  }

  /** The recipient's active browsers, each exact endpoint once. */
  private async browsers(recipient: Recipient) {
    return distinct(
      await this.deps.subscriptions.active(
        recipient.audience === 'reply'
          ? { commentId: recipient.commentId, userId: recipient.userId }
          : { userId: recipient.userId },
      ),
    );
  }

  /** Why a queued mail must not go out now; null when it may. */
  private async mailRefusal(
    job: z.output<typeof mailJobSchema>,
    settings: DiscussionSettings,
    siteUrl: string,
  ): Promise<Refusal | null> {
    if (!siteUrl || !(await this.deps.email.enabled())) return 'disabled';
    const { recipient } = job;
    if (recipient.audience === 'author') {
      if (!settings.notifyAuthors) return 'disabled';
      const user = await this.deps.users.get(recipient.userId);
      return user?.email === job.to ? null : 'recipient';
    }
    if (!settings.notifyCommenters) return 'disabled';
    const parent = await this.deps.comments.findById(recipient.commentId);
    if (!parent || parent.authorEmail !== job.to) return 'recipient';
    return (await this.deps.state.replyMail(parent.id)) ? null : 'unsubscribed';
  }

  /** `withdrawn` when the announced comment is no longer approved or was erased (empty body). */
  private async withdrawn(content: Content): Promise<Refusal | null> {
    if (content.kind === 'summary') return null;
    const record = await this.deps.comments.findById(content.commentId);
    return record?.status === 'approved' && record.body ? null : 'withdrawn';
  }

  private dropped(
    channel: CommentNoticeChannel,
    reason: Refusal,
    content: Content,
  ) {
    this.deps.logger.info('Comment notification dropped', {
      channel,
      reason,
      notices: content.kind === 'summary' ? content.count : 1,
    });
  }

  /** The service worker's payload, rendered now and passed through `comment.push`. */
  private async pushPayload(
    job: z.output<typeof pushJobSchema>,
  ): Promise<CommentPushPayload> {
    const { siteUrl, icon, locale } = await this.deps.site();
    const copy = templates(locale);
    const { content } = job;
    const iconUrl = icon && siteUrl ? new URL(icon, siteUrl) : null;
    const payload = {
      title:
        content.kind === 'summary'
          ? copy.pushSummary(content.count)
          : content.kind === 'reply'
            ? copy.pushReply(content.name, job.others)
            : copy.pushComment(content.name, content.title, job.others),
      body: content.kind === 'summary' ? '' : excerpt(content.body),
      url: content.link,
      tag: job.tag,
      // Same-origin only: an icon on another host would let it see who received the push.
      ...(iconUrl &&
        iconUrl.origin === new URL(content.link).origin && {
          icon: iconUrl.href,
        }),
    };
    const fixed = commentPushPayloadSchema.extend({
      url: z.literal(payload.url),
      tag: z.literal(payload.tag),
      // Without a site icon the key must stay absent (a plugin may not add one).
      icon: payload.icon ? z.literal(payload.icon) : z.never().optional(),
    });
    return fixed.parse(
      await this.deps.hooks.applyFilter(
        'comment.push',
        fixed.parse(payload),
        (value) => fixed.safeParse(value).success,
      ),
    );
  }

  private async save(owner: Owner, subscription: Subscription, cap: number) {
    const now = this.deps.clock.now();
    await this.deps.subscriptions.save(
      {
        id: this.deps.ids.next(),
        ...owner,
        ...keysOf(subscription),
        status: 'active',
        invalidReason: null,
        invalidatedAt: null,
        lastSeenAt: now,
        createdAt: now,
      },
      cap,
    );
  }

  /** VAPID `sub`: the https site address, else an administrator's mailbox. */
  private async subject() {
    const { siteUrl } = await this.deps.site();
    if (siteUrl.startsWith('https://')) return new URL(siteUrl).origin;
    const admin = (await this.deps.users.list()).find(
      (user) => user.role === 'administrator',
    );
    if (!admin) throw new Error(Errors.PushSubjectMissing);
    return `mailto:${admin.email}`;
  }

  private async limit(key: string) {
    if (
      await this.deps.limits.hit(
        `push:${key}`,
        PUSH_WRITE_RULE,
        this.deps.clock.now(),
      )
    )
      throw rateLimited(Errors.TooManyAttempts);
  }

  private token(purpose: string, parts: string[], lifetime: number) {
    const signed = [
      ...parts,
      String(this.deps.clock.now().getTime() + lifetime),
    ];
    return `${signed.join('.')}.${this.deps.signer.sign(`${purpose}:${signed.join(':')}`)}`;
  }

  private verify(purpose: string, token: string, count: number) {
    const parts = token.split('.');
    if (token.length > 1024 || parts.length !== count + 2) return null;
    const signature = parts.pop()!;
    const expires = parts.at(-1)!;
    if (
      !/^\d{1,16}$/.test(expires) ||
      Number(expires) <= this.deps.clock.now().getTime() ||
      !this.deps.signer.verify(`${purpose}:${parts.join(':')}`, signature)
    )
      return null;
    return parts.slice(0, count);
  }
}
