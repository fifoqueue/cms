import { describe, expect, test } from 'bun:test';
import type { ContentInput } from '@cms/sdk';
import {
  CLIENT_USER_AGENT_HEADER,
  SSO_CLIENT_ADDRESS_HEADER,
  SSO_FRONTEND_SECRET_HEADER,
} from '@cms/sdk';
import { ClientResolver } from '#api/http/client-identity';
import { CommentService } from '#api/domain/comments/comment-service';
import type { CommentServiceDeps } from '#api/domain/comments/comment-service';
import { CommentCheckers } from '#api/domain/comments/comment-checkers';
import { ContentLocks } from '#api/domain/content/content-locks';
import { MemoryPublishedContentRepository } from '#test/support/memory-published';
import { hmacSigner } from '#api/infra/hmac-signer';
import { ProtectionService } from '#api/domain/security/protection-service';
import { SecuritySettingsService } from '#api/domain/security/security-settings';
import { HookBus } from '#api/plugin-runtime/hook-bus';
import type { DomainError } from '#api/shared/errors';
import {
  ADMIN,
  MemoryContentRepository,
  MemorySettings,
  fixedClock,
  plainHasher,
  recordingLogger,
  sequentialIds,
  testTypes,
  userRecord,
} from '#test/support/memory';
import { testContentService, textDocument } from '#test/support/content';
import { MemoryCommentRepository } from '#test/support/memory-comments';
import {
  MemoryRateLimitStore,
  plainSecretBox,
} from '#test/support/memory-security';
import type { CommentPushPayload } from '@cms/sdk';
import {
  COMMENT_MAIL_JOB,
  COMMENT_NOTICE_JOB,
  COMMENT_PUSH_JOB,
  COMMENT_SUMMARY_JOB,
  CommentNotifier,
} from '#api/domain/comments/comment-notifier';
import { JobRunner } from '#api/domain/jobs/job-runner';
import { VapidKeys } from '#api/domain/comments/vapid-keys';
import type { EmailMessage } from '#api/domain/email/ports';
import { SealedJobs } from '#api/domain/jobs/sealed-jobs';
import { generateVapidKeys } from '#api/infra/web-push';
import { MemoryJobQueue } from '#test/support/memory-jobs';
import {
  MemoryCommentNoticeState,
  MemoryNoticeOutbox,
  MemoryPushSubscriptions,
} from '#test/support/memory-notifications';

const codeOf = (promise: Promise<unknown>) =>
  promise.then(
    () => 'ok',
    (error: DomainError) => error.code,
  );

const setup = (
  mail = false,
  checkers?: CommentServiceDeps['checkers'],
  recipients: Partial<Pick<CommentServiceDeps, 'users' | 'roles'>> = {},
) => {
  const repository = new MemoryContentRepository();
  const ids = sequentialIds();
  const clock = fixedClock();
  const hooks = new HookBus({
    timeoutMs: 50,
    logger: recordingLogger().logger,
  });
  const settings = new MemorySettings();
  const types = testTypes(settings);
  const content = testContentService({ repository, hooks, ids, clock, types });
  const store = new MemoryCommentRepository(repository);
  const security = new SecuritySettingsService(settings, plainSecretBox);
  const signer = hmacSigner('comment-test-key');
  const notices: unknown[] = [];
  const locks = new ContentLocks({
    repository: new MemoryPublishedContentRepository(repository),
    hasher: plainHasher,
    signer,
    clock,
  });
  const email = {
    enabled: async () => mail,
    queue: async (message: EmailMessage) => {
      notices.push(message);
    },
    /** Set to make the next sends fail, like an unreachable mail server. */
    failures: 0,
    sendNow: async (message: EmailMessage) => {
      if (email.failures > 0) {
        email.failures -= 1;
        throw new Error('mail server unreachable');
      }
      notices.push(message);
    },
  };
  const users: CommentServiceDeps['users'] = recipients.users ?? {
    list: async () => [],
    get: async (id) =>
      id === ADMIN.id
        ? {
            ...userRecord({
              id,
              name: 'Profile name',
              email: 'profile@example.com',
            }),
            contentCount: 0,
          }
        : null,
  };
  const siteIcon = { value: '/media/icon.png' as string | null };
  const site = async () => ({
    siteUrl: 'https://blog.example',
    title: 'Site',
    locale: 'en',
    icon: siteIcon.value,
  });
  const queue = new MemoryJobQueue(() => clock.now());
  const jobs = new SealedJobs(queue, plainSecretBox);
  const subscriptions = new MemoryPushSubscriptions();
  const outbox = new MemoryNoticeOutbox(queue);
  const noticeState = new MemoryCommentNoticeState(store, queue);
  const dropped: unknown[] = [];
  const sent: { endpoint: string; payload: CommentPushPayload }[] = [];
  const sender = {
    status: 201,
    send: async (target: { endpoint: string }, payload: string) => {
      sent.push({
        endpoint: target.endpoint,
        payload: JSON.parse(payload) as CommentPushPayload,
      });
      return sender.status;
    },
  };
  const limits = new MemoryRateLimitStore();
  const notifier = new CommentNotifier({
    comments: store,
    state: noticeState,
    subscriptions,
    outbox,
    logger: { info: (_message, details) => void dropped.push(details) },
    keys: new VapidKeys({
      transactions: settings,
      secrets: plainSecretBox,
      generate: generateVapidKeys,
    }),
    sender,
    email,
    jobs,
    limits,
    hooks,
    signer,
    users,
    site,
    discussion: () => comments.discussion(),
    ids,
    clock,
  });
  const comments: CommentService = new CommentService({
    notifier,
    checkers,
    locks,
    signer,
    avatar: {
      url: (key, discussion) =>
        discussion.showAvatars
          ? `/avatars/${encodeURIComponent(key)}.signed?s=96`
          : null,
    },
    repository: store,
    settings,
    types,
    protection: new ProtectionService({
      settings: security,
      store: new MemoryRateLimitStore(),
      captcha: { verify: async () => true },
      clock,
    }),
    hooks,
    email,
    users,
    site,
    ids,
    clock,
    ...recipients,
  });
  const runner = new JobRunner({
    queue,
    clock,
    logger: recordingLogger().logger,
    owner: 'test',
  });
  runner.handle(COMMENT_NOTICE_JOB, (payload) =>
    notifier.deliverNotice(payload),
  );
  runner.handle(COMMENT_MAIL_JOB, (payload) => notifier.deliverMail(payload));
  runner.handle(COMMENT_PUSH_JOB, (payload) => notifier.deliverPush(payload));
  runner.handle(COMMENT_SUMMARY_JOB, (payload) =>
    notifier.deliverSummary(payload),
  );
  /** Runs the job runner until no job is due now (retries wait for their backoff). */
  const drain = async () => {
    const due = () =>
      [...queue.rows.values()].some(
        (row) =>
          !row.failedAt &&
          row.runAt <= clock.now() &&
          (!row.lockedUntil || row.lockedUntil < clock.now()),
      );
    while (due()) await runner.drain();
  };
  const publish = (overrides: Partial<ContentInput> = {}) =>
    content.create(
      {
        type: 'post',
        title: 'Hello',
        status: 'published',
        document: textDocument('Body'),
        ...overrides,
      },
      ADMIN,
    );
  return {
    content,
    comments,
    store,
    hooks,
    security,
    repository,
    publish,
    clock,
    locks,
    notices,
    notifier,
    subscriptions,
    noticeState,
    outbox,
    email,
    dropped,
    sender,
    sent,
    queue,
    drain,
    settings,
    siteIcon,
  };
};

const visitor = { client: 'ip:203.0.113.1', address: null, captchaToken: null };
const comment = (
  contentId: string,
  overrides: Record<string, unknown> = {},
) => ({
  contentId,
  authorName: 'Ann',
  authorEmail: 'Ann@Example.com',
  body: 'Nice post',
  ...overrides,
});

describe('CommentService', () => {
  test('a failing core checker fails the submit instead of approving', async () => {
    const checkers = new CommentCheckers(10);
    checkers.registerCore({
      check: () => {
        throw new Error('core offline');
      },
    });
    const { comments, publish, store } = setup(false, checkers);
    const entry = await publish();
    await comments.updateDiscussion({ moderation: 'auto' }, ADMIN);
    await expect(comments.submit(comment(entry.id), visitor)).rejects.toThrow(
      'core offline',
    );
    expect(store.rows.size).toBe(0);
  });
  test('public threads never expose emails and only public, open entries take comments', async () => {
    const { comments, publish, content } = setup();
    const entry = await publish();
    const draft = await content.create(
      {
        type: 'post',
        title: 'Draft',
        document: { type: 'doc', content: [{ type: 'paragraph' }] },
      },
      ADMIN,
    );
    const closed = await publish({ title: 'Closed', allowComments: false });
    const page = await publish({ type: 'page', title: 'About' });

    expect(await codeOf(comments.submit(comment(draft.id), visitor))).toBe(
      'not_found',
    );
    expect(await codeOf(comments.submit(comment(closed.id), visitor))).toBe(
      'forbidden',
    );
    // Pages do not support comments by default.
    expect(await codeOf(comments.submit(comment(page.id), visitor))).toBe(
      'forbidden',
    );
    expect(await codeOf(comments.publicPage(draft.id, 1))).toBe('not_found');

    await comments.updateDiscussion({ moderation: 'auto' }, ADMIN);
    const sent = await comments.submit(comment(entry.id), visitor);
    expect(sent.status).toBe('approved');
    const thread = await comments.publicPage(entry.id, 1);
    expect(thread).toMatchObject({ count: 1, open: true });
    expect(JSON.stringify(thread)).not.toContain('example.com');
    expect(JSON.stringify(sent)).not.toContain('example.com');
    expect(
      JSON.stringify(await comments.feed({ contentId: entry.id })),
    ).not.toContain('example.com');
    expect(thread.items[0]?.avatarUrl).toBeNull();
    await comments.updateDiscussion(
      { showAvatars: true, avatarDefault: 'identicon' },
      ADMIN,
    );
    const avatars = await comments.publicPage(entry.id, 1);
    expect(avatars.items[0]?.avatarUrl).toBe(
      `/avatars/comment%3A${sent.comment!.id}.signed?s=96`,
    );
    expect(JSON.stringify(avatars)).not.toContain('example.com');
  });

  test('protected comments require a current unlock proof for both reads and writes', async () => {
    const { comments, content, publish, locks } = setup();
    const entry = await publish({ password: 'secret' });
    await comments.updateDiscussion({ moderation: 'auto' }, ADMIN);
    expect(await codeOf(comments.publicPage(entry.id, 1))).toBe('not_found');
    expect(await codeOf(comments.submit(comment(entry.id), visitor))).toBe(
      'not_found',
    );
    const { token } = await locks.unlock(entry.id, { password: 'secret' });
    const proofs = [`${entry.id}.${token}`];
    await comments.submit(comment(entry.id), visitor, proofs);
    expect((await comments.publicPage(entry.id, 1, proofs)).items).toHaveLength(
      1,
    );
    expect(await comments.recent(10)).toEqual([]);
    expect(await comments.feed({})).toEqual([]);
    expect(await codeOf(comments.feed({ contentId: entry.id }))).toBe(
      'not_found',
    );
    await content.update(
      entry.id,
      {
        type: 'post',
        title: 'Hello',
        status: 'published',
        document: { type: 'doc', content: [{ type: 'paragraph' }] },
        password: 'changed',
      },
      ADMIN,
    );
    expect(await codeOf(comments.publicPage(entry.id, 1, proofs))).toBe(
      'not_found',
    );
    expect(
      await codeOf(comments.submit(comment(entry.id), visitor, proofs)),
    ).toBe('not_found');
  });

  test('only proven IP addresses and user agents are stored, and only moderators see them', async () => {
    const { comments, publish, store } = setup();
    const entry = await publish();
    await comments.updateDiscussion({ moderation: 'auto' }, ADMIN);
    const clients = new ClientResolver('frontend-secret');
    const browser = {
      [SSO_CLIENT_ADDRESS_HEADER]: '::ffff:203.0.113.9',
      [CLIENT_USER_AGENT_HEADER]: `Mozilla/5.0\t(Test) ${'x'.repeat(300)}`,
    };
    // As the comment routes read a request.
    const from = (headers: Record<string, string>) => {
      const request = new Request('http://localhost/', { headers });
      return {
        ...clients.attempt(request),
        userAgent: clients.userAgent(request),
      };
    };
    const proven = await comments.submit(
      comment(entry.id),
      from({ ...browser, [SSO_FRONTEND_SECRET_HEADER]: 'frontend-secret' }),
    );
    // The same headers without the frontend secret, or with a wrong one, are forged.
    const forged = await comments.submit(
      comment(entry.id, { body: 'Forged' }),
      from(browser),
    );
    const wrong = await comments.submit(
      comment(entry.id, { body: 'Wrong secret' }),
      from({ ...browser, [SSO_FRONTEND_SECRET_HEADER]: 'guess' }),
    );
    expect(store.rows.get(proven.comment!.id)).toMatchObject({
      authorIp: '203.0.113.9',
      authorUserAgent: `Mozilla/5.0(Test) ${'x'.repeat(237)}`,
    });
    for (const sent of [forged, wrong])
      expect(store.rows.get(sent.comment!.id)).toMatchObject({
        authorIp: null,
        authorUserAgent: null,
      });
    await comments.reply(proven.comment!.id, { body: 'Thanks' }, ADMIN, {
      address: '2001:DB8:0:0:0:0:0:1',
      userAgent: 'Moderator browser',
    });

    const ids = [proven, forged, proven].map((sent) => sent.comment!.id);
    const listed = await comments.list({ ids: ids.join(',') }, ADMIN);
    expect(
      listed.items.map((item) => [item.body, item.authorIp]).sort(),
    ).toEqual([
      ['Forged', null],
      ['Nice post', '203.0.113.9'],
    ]);
    expect(
      (await comments.list({ search: '2001:db8::1' }, ADMIN)).items,
    ).toMatchObject([{ body: 'Thanks', authorUserAgent: 'Moderator browser' }]);
    for (const output of [
      proven,
      await comments.publicPage(entry.id, 1),
      await comments.feed({ contentId: entry.id }),
    ])
      expect(JSON.stringify(output)).not.toMatch(
        /203\.0\.113|2001:db8|Mozilla|Moderator browser/,
      );
  });

  test('registered-only comments use the authenticated profile, never supplied identity', async () => {
    const { comments, publish, store } = setup();
    const entry = await publish();
    await comments.updateDiscussion(
      {
        requireLogin: true,
        moderation: 'auto',
        showName: false,
        defaultName: 'Guest',
        showEmail: false,
        showWebsite: false,
      },
      ADMIN,
    );
    expect(await codeOf(comments.submit(comment(entry.id), visitor))).toBe(
      'forbidden',
    );
    const sent = await comments.submit(
      comment(entry.id, {
        authorName: 'Impostor',
        authorEmail: 'other@example.com',
        authorUrl: 'https://impostor.example.com',
        userId: 'other',
      }),
      visitor,
      [],
      ADMIN,
    );
    expect(store.rows.get(sent.comment!.id)).toMatchObject({
      userId: ADMIN.id,
      authorName: 'Profile name',
      authorEmail: 'profile@example.com',
      authorUrl: '',
    });
    expect(sent.comment).toMatchObject({
      byAuthor: true,
      authorName: 'Profile name',
    });
    expect(JSON.stringify(sent)).not.toContain('profile@example.com');
  });

  test('only authenticated moderators bypass approval rules, keeping trust and entry checks', async () => {
    const { comments, publish, store } = setup();
    const entry = await publish();
    const moderator = {
      id: ADMIN.id,
      role: 'custom',
      capabilities: ['comments.moderate'] as const,
    };
    for (const moderation of ['manual', 'known'] as const) {
      const scoped = setup();
      const target = await scoped.publish();
      await scoped.comments.updateDiscussion(
        {
          moderation,
          blockWords: ['casino'],
          holdWords: ['refund'],
          maxLinks: 0,
        },
        ADMIN,
      );
      expect(
        (
          await scoped.comments.submit(
            comment(target.id, {
              role: 'administrator',
              capabilities: ['comments.moderate'],
              userId: ADMIN.id,
            }),
            visitor,
          )
        ).status,
      ).toBe('pending');
      expect(
        (
          await scoped.comments.submit(comment(target.id), visitor, [], {
            ...ADMIN,
            capabilities: [],
          })
        ).status,
      ).toBe('pending');
      expect(
        (
          await scoped.comments.submit(
            comment(target.id),
            visitor,
            [],
            moderator,
          )
        ).status,
      ).toBe('approved');
    }
    await comments.updateDiscussion(
      {
        moderation: 'manual',
        blockWords: ['casino'],
        holdWords: ['refund'],
        maxLinks: 0,
      },
      ADMIN,
    );
    for (const body of ['casino', 'refund', 'https://example.com'])
      expect(
        (
          await comments.submit(
            comment(entry.id, { body }),
            visitor,
            [],
            moderator,
          )
        ).status,
      ).toBe('approved');
    await comments.submit(comment(entry.id, { body: 'casino' }), visitor);
    expect([...store.rows.values()].some((row) => row.status === 'spam')).toBe(
      true,
    );
    const before = store.rows.size;
    await comments.submit(
      comment(entry.id, { website: 'bot' }),
      visitor,
      [],
      moderator,
    );
    expect(store.rows.size).toBe(before);
    const protectedEntry = await publish({
      title: 'Protected',
      password: 'secret',
    });
    const closed = await publish({ title: 'Closed', allowComments: false });
    expect(
      await codeOf(
        comments.submit(comment(protectedEntry.id), visitor, [], moderator),
      ),
    ).toBe('not_found');
    expect(
      await codeOf(comments.submit(comment(closed.id), visitor, [], moderator)),
    ).toBe('forbidden');
  });

  test('pending receipts reveal only their own comment, bound to entry, signature, expiry and status', async () => {
    const { comments, publish, clock, store } = setup();
    const entry = await publish();
    const other = await publish({ title: 'Other' });
    const first = await comments.submit(
      comment(entry.id, { body: 'Mine' }),
      visitor,
    );
    const second = await comments.submit(
      comment(entry.id, { body: 'Someone else' }),
      visitor,
    );
    expect((await comments.publicPage(entry.id, 1)).ownPending).toBeNull();
    const own = await comments.publicPage(
      entry.id,
      1,
      [],
      null,
      first.pendingProof!,
    );
    expect(own.items).toEqual([]);
    expect(own.ownPending).toMatchObject({ body: 'Mine', pending: true });
    expect(JSON.stringify(own)).not.toContain('example.com');
    expect(JSON.stringify(own)).not.toContain('Someone else');
    const forged = first.pendingProof!.replace(
      first.pendingProof!.split('.')[0]!,
      second.pendingProof!.split('.')[0]!,
    );
    expect(
      (await comments.publicPage(entry.id, 1, [], null, forged)).ownPending,
    ).toBeNull();
    expect(
      (await comments.publicPage(other.id, 1, [], null, first.pendingProof!))
        .ownPending,
    ).toBeNull();
    await comments.bulk({ ids: [own.ownPending!.id], action: 'spam' }, ADMIN);
    expect(
      (await comments.publicPage(entry.id, 1, [], null, first.pendingProof!))
        .ownPending,
    ).toBeNull();
    expect([...store.rows.values()].some((row) => row.status === 'spam')).toBe(
      true,
    );
    clock.set('2026-01-03T00:00:00.000Z');
    expect(
      (await comments.publicPage(entry.id, 1, [], null, second.pendingProof!))
        .ownPending,
    ).toBeNull();
  });

  test('entry-scoped moderation changes nothing when a comment belongs elsewhere', async () => {
    const { comments, publish, store } = setup();
    const entry = await publish();
    const other = await publish({ title: 'Other' });
    await comments.submit(comment(entry.id), visitor);
    await comments.submit(comment(other.id), visitor);
    const [own] = (await comments.list({ contentId: entry.id }, ADMIN)).items;
    const [foreign] = (await comments.list({ contentId: other.id }, ADMIN))
      .items;

    for (const action of ['approve', 'trash', 'delete'] as const)
      expect(
        await codeOf(
          comments.bulk(
            { ids: [own!.id, foreign!.id], action, contentId: entry.id },
            ADMIN,
          ),
        ),
      ).toBe('not_found');
    expect(
      await codeOf(
        comments.bulk(
          { ids: ['missing'], action: 'approve', contentId: entry.id },
          ADMIN,
        ),
      ),
    ).toBe('not_found');
    expect([...store.rows.values()].map(({ status }) => status).sort()).toEqual(
      ['pending', 'pending'],
    );
    expect(
      await codeOf(
        comments.bulk(
          { ids: [own!.id], action: 'approve', contentId: entry.id },
          { id: 'reader', role: 'subscriber' },
        ),
      ),
    ).toBe('forbidden');

    await comments.bulk(
      { ids: [own!.id], action: 'approve', contentId: entry.id },
      ADMIN,
    );
    expect(store.rows.get(own!.id)?.status).toBe('approved');
    await comments.bulk(
      { ids: [own!.id], action: 'delete', contentId: entry.id },
      ADMIN,
    );
    expect(store.rows.has(own!.id)).toBe(false);
    expect(store.rows.get(foreign!.id)?.status).toBe('pending');
  });

  test('moderation holds first comments, filters spam, and keeps the approved count', async () => {
    const { comments, store, publish, repository } = setup();
    const entry = await publish();
    await comments.updateDiscussion(
      { blockWords: ['casino'], holdWords: ['refund'] },
      ADMIN,
    );

    // The honeypot answers like a held comment and stores nothing.
    expect(
      await comments.submit(comment(entry.id, { website: 'x' }), visitor),
    ).toMatchObject({ status: 'pending', comment: null, pendingProof: null });
    expect(store.rows.size).toBe(0);

    const firstSubmission = await comments.submit(comment(entry.id), visitor);
    expect(firstSubmission.status).toBe('pending');
    const spam = await comments.submit(
      comment(entry.id, { body: 'Best CASINO' }),
      visitor,
    );
    expect(spam.status).toBe('pending');
    expect((await comments.counts(ADMIN)).spam).toBe(1);

    const [first] = (await comments.list({ status: 'pending' }, ADMIN)).items;
    await comments.bulk({ ids: [first!.id], action: 'approve' }, ADMIN);
    expect(repository.commentCounts.get(entry.id)).toBe(1);
    // An approved email alone is spoofable; only its signed commenter proof skips the queue.
    expect((await comments.submit(comment(entry.id), visitor)).status).toBe(
      'pending',
    );
    expect(
      (
        await comments.submit(
          comment(entry.id),
          visitor,
          [],
          null,
          firstSubmission.commenterProof!,
        )
      ).status,
    ).toBe('approved');
    expect(
      (
        await comments.submit(
          comment(entry.id),
          visitor,
          [],
          null,
          `${firstSubmission.commenterProof}forged`,
        )
      ).status,
    ).toBe('pending');
    expect(
      (
        await comments.submit(
          comment(entry.id, { authorEmail: 'other@example.com' }),
          visitor,
          [],
          null,
          firstSubmission.commenterProof!,
        )
      ).status,
    ).toBe('pending');
    expect(
      (
        await comments.submit(
          comment(entry.id, { body: 'refund?' }),
          visitor,
          [],
          null,
          firstSubmission.commenterProof!,
        )
      ).status,
    ).toBe('pending');
    expect(repository.commentCounts.get(entry.id)).toBe(2);

    // Replies stay when their parent is deleted.
    const reply = await comments.submit(
      comment(entry.id, { parentId: first!.id, body: 'Agreed' }),
      visitor,
      [],
      null,
      firstSubmission.commenterProof!,
    );
    await comments.remove(first!.id, ADMIN);
    const thread = await comments.publicPage(entry.id, 1);
    expect(thread.items.map((item) => [item.body, item.depth])).toEqual([
      ['Nice post', 0],
      ['Agreed', 0],
    ]);
    expect(thread.items[1]!.id).toBe(reply.comment!.id);
    expect(repository.commentCounts.get(entry.id)).toBe(2);
  });
});

describe('comment notifications', () => {
  const browser = (endpoint = 'https://fcm.googleapis.com/fcm/send/abc') => ({
    endpoint,
    expirationTime: null,
    keys: { p256dh: 'p256dh-key', auth: 'auth-secret' },
  });
  const reply = (contentId: string, parentId: string, name = 'Bob') =>
    comment(contentId, {
      parentId,
      authorName: name,
      authorEmail: `${name.toLowerCase()}@example.com`,
      body: `Reply from ${name}`,
    });
  const ready = async (
    mail = true,
    discussion: Record<string, unknown> = {},
  ) => {
    const context = setup(mail);
    const entry = await context.publish();
    await context.comments.updateDiscussion(
      {
        moderation: 'auto',
        notifyCommenters: true,
        pushNotifications: true,
        ...discussion,
      },
      ADMIN,
    );
    const parent = await context.comments.submit(comment(entry.id), visitor);
    await context.drain();
    context.notices.length = 0;
    return { ...context, entry, parent };
  };
  const to = (notices: unknown[], address: string) =>
    (notices as EmailMessage[]).filter((notice) => notice.to === address);

  test('an approved reply emails and pushes the parent author exactly once', async () => {
    const { comments, notifier, entry, parent, notices, drain, sent } =
      await ready();
    await notifier.registerVisitor(
      { token: parent.pushToken, subscription: browser() },
      visitor.client,
    );
    const answer = await comments.submit(
      reply(entry.id, parent.comment!.id),
      visitor,
    );
    await drain();
    const mails = to(notices, 'ann@example.com');
    expect(mails).toHaveLength(1);
    expect(mails[0]!.text).toContain('Reply from Bob');
    expect(mails[0]!.text).toContain(
      'https://blog.example/comments/unsubscribe?token=',
    );
    await drain();
    expect(sent).toEqual([
      {
        endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
        payload: {
          title: 'Bob replied to your comment',
          body: 'Reply from Bob',
          url: `https://blog.example/hello#comment-${answer.comment!.id}`,
          tag: `comment-${parent.comment!.id}`,
          icon: 'https://blog.example/media/icon.png',
        },
      },
    ]);
    // Moderation flips never announce the same reply again.
    await comments.bulk(
      { ids: [answer.comment!.id], action: 'unapprove' },
      ADMIN,
    );
    await comments.bulk(
      { ids: [answer.comment!.id], action: 'approve' },
      ADMIN,
    );
    await drain();
    expect(to(notices, 'ann@example.com')).toHaveLength(1);
    expect(sent).toHaveLength(1);
  });

  const later = (clock: { now(): Date; set(iso: string): void }) =>
    // Past the job runner's first retry backoff (one minute).
    clock.set(new Date(clock.now().getTime() + 2 * 60_000).toISOString());

  test('a failed claim surfaces, leaves the comment unclaimed and a repeated approval announces it once', async () => {
    const { comments, entry, parent, notices, drain, noticeState, queue } =
      await ready();
    await comments.updateDiscussion(
      { moderation: 'manual', notifyCommenters: true },
      ADMIN,
    );
    await comments.submit(reply(entry.id, parent.comment!.id), visitor);
    const [held] = (await comments.list({ status: 'pending' }, ADMIN)).items;
    noticeState.failures = 1;
    expect(
      await codeOf(
        comments.bulk({ ids: [held!.id], action: 'approve' }, ADMIN),
      ),
    ).not.toBe('ok');
    expect(noticeState.claimed.has(held!.id)).toBe(false);
    expect(
      [...queue.rows.values()].some((row) => row.kind === COMMENT_NOTICE_JOB),
    ).toBe(false);
    // The status change committed; approving again claims and queues the notice.
    await comments.bulk({ ids: [held!.id], action: 'approve' }, ADMIN);
    await comments.bulk({ ids: [held!.id], action: 'approve' }, ADMIN);
    await drain();
    expect(to(notices, 'ann@example.com')).toHaveLength(1);
  });

  test('fan-out and delivery failures retry; a repeated fan-out queues nothing twice', async () => {
    // Only the reply mail goes out, so the injected failure hits it.
    const {
      comments,
      notifier,
      entry,
      parent,
      notices,
      drain,
      outbox,
      email,
      queue,
      clock,
    } = await ready(true, { notifyAuthors: false });
    outbox.failures = 1;
    email.failures = 1;
    await comments.submit(reply(entry.id, parent.comment!.id), visitor);
    const [notice] = [...queue.rows.values()].filter(
      (row) => row.kind === COMMENT_NOTICE_JOB,
    );
    const payload = structuredClone(notice!.payload);
    await drain();
    expect(to(notices, 'ann@example.com')).toHaveLength(0);
    later(clock);
    await drain();
    // The fan-out ran; the mail itself failed once and waits for its own retry.
    expect(to(notices, 'ann@example.com')).toHaveLength(0);
    later(clock);
    await drain();
    expect(to(notices, 'ann@example.com')).toHaveLength(1);
    // A fan-out retried after it already queued (a crash before completion) queues nothing.
    await notifier.deliverNotice(payload);
    await drain();
    expect(to(notices, 'ann@example.com')).toHaveLength(1);
  });
});
