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
import { DefinitionRegistry } from '#api/domain/content/definition-registry';
import { FieldService } from '#api/domain/content/fields';
import { invalidatingStore } from '#api/infra/invalidating-store';
import { MemoryPublicCache } from '#api/infra/public-cache';
import { fieldDefinitionSchema } from '@cms/sdk';
import type { UserListItem } from '#api/domain/users/user-directory';
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
  recipients: Partial<
    Pick<CommentServiceDeps, 'users' | 'roles' | 'fields'>
  > = {},
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

test('discussion settings filter before commit and public projection excludes moderation rules', async () => {
  const { comments, hooks, settings, publish } = setup();
  const announced: unknown[] = [];
  const committed: unknown[] = [];
  const publicSeen: unknown[] = [];
  const registrar = hooks.registrar('functions:site', { trusted: true });

  registrar.filter('settings.beforeSave', (value) =>
    value.section === 'discussion'
      ? { ...value, settings: { ...value.settings, requireLogin: true } }
      : value,
  );
  registrar.on('settings.updated', (value) => {
    announced.push(value);
    committed.push(settings.values.get('discussion'));
  });
  await comments.updateDiscussion({ holdWords: ['private moderation'] }, ADMIN);
  expect(announced).toHaveLength(1);
  expect(committed[0]).toMatchObject({ requireLogin: true });
  registrar.filter('settings.public', (value) => {
    publicSeen.push(structuredClone(value));

    return value.section === 'discussion'
      ? { ...value, settings: { ...value.settings, requireLogin: false } }
      : value;
  });
  const entry = await publish();
  const page = await comments.publicPage(entry.id, 1);

  expect(page.requireLogin).toBe(false);
  expect(publicSeen).toHaveLength(1);
  expect(JSON.stringify(publicSeen)).not.toContain('private moderation');
});
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
  test('object capabilities admit moderation but refuse a mixed batch before writing', async () => {
    const { comments, publish, store, hooks } = setup();
    const entry = await publish();

    await comments.submit(comment(entry.id), visitor);
    await comments.submit(comment(entry.id), visitor);
    const [first, second] = [...store.rows.keys()];
    const reader = { id: 'reader', role: 'subscriber' };

    hooks.registrar('object-policy').filter('capability.check', (value) => ({
      ...value,
      allowed: value.object.id === first,
    }));
    await expect(
      comments.bulk({ ids: [first, second], action: 'approve' }, reader),
    ).rejects.toMatchObject({ code: 'forbidden' });
    expect([...store.rows.values()].map((row) => row.status)).toEqual([
      'pending',
      'pending',
    ]);
    await comments.bulk({ ids: [first], action: 'approve' }, reader);
    expect(store.rows.get(first!)?.status).toBe('approved');
    await expect(comments.remove(second!, ADMIN)).rejects.toMatchObject({
      code: 'forbidden',
    });
  });
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
  test('a later submit filter can admit a comment an earlier one refused', async () => {
    const { comments, publish, hooks, store } = setup();
    const entry = await publish();

    hooks.registrar('deny').filter('comment.submitAllowed', (value) => ({
      ...value,
      allowed: false,
    }));
    expect(await codeOf(comments.submit(comment(entry.id), visitor))).toBe(
      'forbidden',
    );
    expect(store.rows.size).toBe(0);
    hooks.registrar('grant').filter('comment.submitAllowed', (value) => ({
      ...value,
      allowed: true,
    }));
    await comments.submit(comment(entry.id), visitor);
    expect(store.rows.size).toBe(1);
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

  test('recent comment links locate roots and replies on their actual comment page', async () => {
    const { comments, publish, store } = setup();
    const entry = await publish();

    await comments.updateDiscussion({ pageSize: 5 }, ADMIN);

    for (let index = 0; index < 7; index += 1) {
      const at = new Date(Date.UTC(2026, 0, 1, 0, 0, index));

      await store.insert({
        id: `recent-${index}`,
        contentId: entry.id,
        parentId: index === 6 ? 'recent-5' : null,
        userId: null,
        authorName: 'Ann',
        authorEmail: 'ann@example.com',
        authorUrl: '',
        authorIp: null,
        authorUserAgent: null,
        body: 'Note',
        status: 'approved',
        fields: {},
        createdAt: at,
        updatedAt: at,
      });
    }

    expect(await comments.recent(2)).toEqual(
      [6, 5].map((index) => ({
        author: 'Ann',
        title: entry.title,
        path: `${entry.path}?cpage=2#comment-recent-${index}`,
      })),
    );
    expect(
      (await comments.publicPage(entry.id, 2)).items.map(({ id }) => id),
    ).toEqual(['recent-5', 'recent-6']);
    await comments.updateDiscussion({ pageSize: 10 }, ADMIN);
    expect((await comments.recent(1))[0]?.path).toBe(
      `${entry.path}?cpage=1#comment-recent-6`,
    );
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
    const spammed = own.ownPending!.id;

    await comments.bulk({ ids: [spammed], action: 'spam' }, ADMIN);
    expect(
      (await comments.publicPage(entry.id, 1, [], null, first.pendingProof!))
        .ownPending,
    ).toBeNull();
    expect([...store.rows.values()].some((row) => row.status === 'spam')).toBe(
      true,
    );
    // A cleanup only deletes comments still in the status it selected.
    expect(await comments.remove(spammed, ADMIN, 'trash')).toBe(false);
    expect(store.rows.get(spammed)?.status).toBe('spam');
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

  test('comment.openAllowed opens and closes entries either way, for writes and the public state', async () => {
    const { comments, publish, hooks, store } = setup();
    const open = await publish();
    const closed = await publish({ title: 'Closed', allowComments: false });
    const seen: unknown[] = [];
    const policy = hooks.registrar('policy');

    policy.filter('comment.openAllowed', (value) => {
      seen.push(structuredClone(value));

      return { ...value, allowed: value.contentId === closed.id };
    });
    expect((await comments.publicPage(open.id, 1)).open).toBe(false);
    expect(seen[0]).toEqual({
      contentId: open.id,
      type: 'post',
      allowed: true,
    });
    expect(await codeOf(comments.submit(comment(open.id), visitor))).toBe(
      'forbidden',
    );
    expect((await comments.publicPage(closed.id, 1)).open).toBe(true);
    await comments.submit(comment(closed.id), visitor);
    expect([...store.rows.values()].map((row) => row.contentId)).toEqual([
      closed.id,
    ]);
    // A later handler reverses an earlier refusal; another entry or type is ignored.
    policy.filter(
      'comment.openAllowed',
      (value) => ({ ...value, allowed: true }),
      20,
    );
    hooks
      .registrar('forger')
      .filter(
        'comment.openAllowed',
        (value) => ({ ...value, type: 'page', allowed: false }),
        30,
      );
    expect((await comments.publicPage(open.id, 1)).open).toBe(true);
  });

  test('comment.publicQuery pages and orders public threads, and comment links follow it', async () => {
    const { comments, publish, hooks, store } = setup();
    const entry = await publish();

    await comments.updateDiscussion({ moderation: 'auto' }, ADMIN);

    for (const [index, id] of ['q-0', 'q-1', 'q-2', 'q-reply'].entries()) {
      const at = new Date(Date.UTC(2025, 0, 1, 0, 0, index));

      await store.insert({
        id,
        contentId: entry.id,
        parentId: id === 'q-reply' ? 'q-0' : null,
        userId: null,
        authorName: 'Ann',
        authorEmail: 'ann@example.com',
        authorUrl: '',
        authorIp: null,
        authorUserAgent: null,
        body: 'Note',
        status: 'approved',
        fields: {},
        createdAt: at,
        updatedAt: at,
      });
    }

    hooks.registrar('newest').filter('comment.publicQuery', (value) => ({
      ...value,
      pageSize: 2,
      order: 'desc' as const,
    }));
    const first = await comments.publicPage(entry.id, 1);

    expect(first.items.map(({ id }) => id)).toEqual(['q-2', 'q-1']);
    expect(first).toMatchObject({ page: 1, pageSize: 2, total: 3 });
    // Replies stay under their comment, oldest first.
    expect(
      (await comments.publicPage(entry.id, 2)).items.map(({ id }) => id),
    ).toEqual(['q-0', 'q-reply']);
    expect((await comments.recent(1))[0]?.path).toBe(
      `${entry.path}?cpage=2#comment-q-reply`,
    );
    // Newest first, a new comment opens page 1.
    expect((await comments.submit(comment(entry.id), visitor)).page).toBe(1);
    // Another entry or an out-of-range size is ignored.
    hooks
      .registrar('invalid')
      .filter(
        'comment.publicQuery',
        (value) => ({ ...value, contentId: 'other', pageSize: 500 }),
        20,
      );
    expect((await comments.publicPage(entry.id, 1)).pageSize).toBe(2);
    // The asked page cannot be rewritten, so a link always reaches the page holding its comment.
    hooks
      .registrar('pinned')
      .filter('comment.publicQuery', (value) => ({ ...value, page: 1 }), 30);
    const link = (await comments.recent(10)).find(({ path }) =>
      path.endsWith('#comment-q-reply'),
    )!.path;
    const cpage = Number(
      new URL(link, 'https://blog.example').searchParams.get('cpage'),
    );

    expect(cpage).toBe(2);
    const linked = await comments.publicPage(entry.id, cpage);

    expect(linked).toMatchObject({ page: 2, pageSize: 2 });
    expect(linked.items.map(({ id }) => id)).toContain('q-reply');
  });

  test('public discussion pagination controls the query, response and recent links together', async () => {
    const { comments, publish, hooks, store } = setup();
    const entry = await publish();

    for (let index = 0; index < 13; index += 1) {
      const at = new Date(Date.UTC(2026, 0, 1, 0, 0, index));

      await store.insert({
        id: `public-${index}`,
        contentId: entry.id,
        parentId: index === 12 ? 'public-0' : null,
        userId: null,
        authorName: 'Ann',
        authorEmail: 'ann@example.com',
        authorUrl: '',
        authorIp: null,
        authorUserAgent: null,
        body: 'Note',
        status: 'approved',
        fields: {},
        createdAt: at,
        updatedAt: at,
      });
    }

    hooks
      .registrar('functions:site', { trusted: true })
      .filter('settings.public', (value) =>
        value.section === 'discussion'
          ? {
              ...value,
              settings: { ...value.settings, pageSize: 5, threadDepth: 1 },
            }
          : value,
      );
    const first = await comments.publicPage(entry.id, 1);
    const second = await comments.publicPage(entry.id, 2);

    expect(first).toMatchObject({ pageSize: 5, threadDepth: 1, total: 12 });
    expect(first.items.map(({ id }) => id)).toEqual([
      'public-0',
      'public-1',
      'public-2',
      'public-3',
      'public-4',
    ]);
    expect(second.items.map(({ id }) => id)).toEqual([
      'public-5',
      'public-6',
      'public-7',
      'public-8',
      'public-9',
    ]);
    expect(
      (await comments.recent(2)).find(({ path }) =>
        path.endsWith('#comment-public-11'),
      )?.path,
    ).toBe(`${entry.path}?cpage=3#comment-public-11`);
    hooks
      .registrar('query')
      .filter('comment.publicQuery', (value) => ({ ...value, pageSize: 2 }));
    const narrowed = await comments.publicPage(entry.id, 2);

    expect(narrowed.pageSize).toBe(2);
    expect(narrowed.items.map(({ id }) => id)).toEqual([
      'public-2',
      'public-3',
    ]);
  });

  test('later comment pages keep the page size and order page 1 got, so links reach their comment', async () => {
    const { comments, publish, hooks, store } = setup();
    const entry = await publish();

    for (const [index, id] of ['first', 'second', 'third'].entries()) {
      const at = new Date(Date.UTC(2025, 0, 1, 0, 0, index));

      await store.insert({
        id,
        contentId: entry.id,
        parentId: null,
        userId: null,
        authorName: 'Ann',
        authorEmail: 'ann@example.com',
        authorUrl: '',
        authorIp: null,
        authorUserAgent: null,
        body: 'Note',
        status: 'approved',
        fields: {},
        createdAt: at,
        updatedAt: at,
      });
    }

    hooks.registrar('uneven').filter('comment.publicQuery', (value) => ({
      ...value,
      pageSize: value.page === 1 ? 2 : 1,
      order: value.page === 1 ? ('asc' as const) : ('desc' as const),
    }));

    const link = (await comments.recent(10)).find(({ path }) =>
      path.endsWith('#comment-third'),
    )!.path;

    expect(link).toBe(`${entry.path}?cpage=2#comment-third`);

    const second = await comments.publicPage(entry.id, 2);

    expect(second).toMatchObject({ page: 2, pageSize: 2 });
    expect(second.items.map(({ id }) => id)).toEqual(['third']);
  });

  test('comment field definitions are read once for public comment reads until settings change', async () => {
    const cache = new MemoryPublicCache();
    const stored = new MemorySettings();
    let reads = 0;
    const settings = invalidatingStore(
      {
        list: (prefix: string) => stored.list(prefix),
        get: (key: string) => {
          if (key === 'contentFields') reads += 1;

          return stored.get(key);
        },
        set: (key: string, value: unknown) => stored.set(key, value),
      },
      ['set'],
      cache,
    );
    const registry = new DefinitionRegistry(fieldDefinitionSchema);
    const fields = new FieldService({
      settings,
      registry,
      images: async () => new Map(),
      cache,
    });
    const { comments, publish } = setup(false, undefined, { fields });
    const entry = await publish();

    await comments.updateDiscussion({ moderation: 'auto' }, ADMIN);
    // No comment fields anywhere: pages and submissions share one read.
    await comments.publicPage(entry.id, 1);
    await comments.submit(comment(entry.id), visitor);
    expect((await comments.publicPage(entry.id, 1)).customFields).toEqual([]);
    expect(reads).toBe(1);
    // Plugin declarations show at once; a definition change drops the cached copy.
    registry.register('demo', 'size', {
      label: 'Size',
      type: 'text',
      comments: true,
    });
    expect(
      (await comments.publicPage(entry.id, 1)).customFields.map(
        ({ key }) => key,
      ),
    ).toEqual(['plugin:demo:size']);
    expect(reads).toBe(1);
    await fields.create(
      { key: 'city', label: 'City', type: 'text', comments: true },
      ADMIN,
    );
    expect(
      (await comments.publicPage(entry.id, 1)).customFields.map(
        ({ key }) => key,
      ),
    ).toEqual(['plugin:demo:size', 'city']);
  });

  test('comment fields are validated on submit, served whole to moderators, publicly only when public, and kept when unregistered', async () => {
    const registry = new DefinitionRegistry(fieldDefinitionSchema);
    const fields = new FieldService({
      settings: new MemorySettings(),
      registry,
      images: async () => new Map(),
    });
    const { comments, publish } = setup(false, undefined, { fields });
    const entry = await publish();

    await comments.updateDiscussion({ moderation: 'auto' }, ADMIN);
    const unregister = registry.register('demo', 'city', {
      label: 'City',
      type: 'text',
      required: true,
      comments: true,
    });

    registry.register('demo', 'phone', {
      label: 'Phone',
      type: 'text',
      public: false,
      comments: true,
    });
    registry.register('demo', 'size', {
      label: 'Size',
      type: 'select',
      options: ['S', 'M'],
      comments: true,
    });
    registry.register('demo', 'rank', {
      label: 'Rank',
      type: 'number',
      contentTypes: ['post'],
    });
    for (const values of [
      { 'plugin:demo:phone': '010' },
      { 'plugin:demo:city': 'Seoul', 'plugin:demo:size': 'XL' },
    ])
      expect(
        await codeOf(
          comments.submit(comment(entry.id, { fields: values }), visitor),
        ),
      ).toBe('invalid_input');
    // Only declared comment fields are kept: no entry fields, unknown or inactive plugin keys.
    const sent = await comments.submit(
      comment(entry.id, {
        fields: {
          'plugin:demo:city': 'Seoul',
          'plugin:demo:phone': '010-1234',
          'plugin:demo:rank': 3,
          'plugin:gone:note': 'x',
          extra: 'x',
        },
      }),
      visitor,
    );

    expect(sent.comment?.fields).toEqual({ 'plugin:demo:city': 'Seoul' });
    const page = await comments.publicPage(entry.id, 1);

    expect(page.customFields).toEqual([
      {
        key: 'plugin:demo:city',
        label: 'City',
        type: 'text',
        options: [],
        required: true,
        help: '',
      },
      {
        key: 'plugin:demo:phone',
        label: 'Phone',
        type: 'text',
        options: [],
        required: false,
        help: '',
      },
      {
        key: 'plugin:demo:size',
        label: 'Size',
        type: 'select',
        options: ['S', 'M'],
        required: false,
        help: '',
      },
    ]);
    expect(page.items[0]?.fields).toEqual({ 'plugin:demo:city': 'Seoul' });
    expect(JSON.stringify(page)).not.toContain('010-1234');
    const stored = {
      'plugin:demo:city': 'Seoul',
      'plugin:demo:phone': '010-1234',
    };

    expect((await comments.list({}, ADMIN)).items[0]?.fields).toEqual(stored);
    // A deactivated plugin's values leave public output but stay stored.
    unregister();
    expect((await comments.publicPage(entry.id, 1)).items[0]?.fields).toEqual(
      {},
    );
    expect((await comments.list({}, ADMIN)).items[0]?.fields).toEqual(stored);
    // Visitors cannot pick media, so image fields never target comments.
    expect(
      fieldDefinitionSchema.safeParse({
        key: 'photo',
        label: 'Photo',
        type: 'image',
        comments: true,
      }).success,
    ).toBe(false);
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

  /** A user directory of these accounts; `user` is the entry author's. */
  const directory = (
    accounts: { id: string; email: string; role: string }[],
  ): CommentServiceDeps['users'] => {
    const people: UserListItem[] = accounts.map((account) => ({
      ...userRecord(account),
      contentCount: 0,
    }));

    return {
      list: async () => people,
      get: async (id) => people.find((person) => person.id === id) ?? null,
    };
  };

  test('moderation recipients may be dropped or added from existing users only; only moderators read the commenter address', async () => {
    const { comments, publish, hooks, notices, drain } = setup(
      true,
      undefined,
      {
        users: directory([
          { id: ADMIN.id, email: 'admin@example.com', role: 'administrator' },
          { id: 'editor', email: 'Editor@Example.com', role: 'editor' },
          { id: 'reader', email: 'reader@example.com', role: 'subscriber' },
        ]),
      },
    );
    const entry = await publish();
    const seen: unknown[] = [];
    let routed: string[] = [];

    hooks
      .registrar('routing')
      .filter('comment.notificationRecipients', (value) => {
        seen.push(structuredClone(value));

        return { ...value, to: routed };
      });

    const mailed = async () => {
      notices.length = 0;
      await comments.submit(comment(entry.id), visitor);
      // Moderator mail is queued after the submission answers; added users' mail is a job.
      await new Promise((resolve) => setTimeout(resolve, 20));
      await drain();

      return (notices as EmailMessage[]).map((notice) => [
        notice.to,
        notice.text.includes('ann@example.com'),
      ]);
    };

    routed = ['Editor@Example.com', 'READER@example.com'];
    expect(await mailed()).toEqual([
      ['Editor@Example.com', true],
      ['reader@example.com', false],
    ]);
    expect(seen[0]).toEqual({
      commentId: expect.any(String),
      kind: 'pending',
      to: ['admin@example.com', 'Editor@Example.com'],
    });
    // An address without an account invalidates the result: core's list goes out.
    routed = ['stranger@example.com'];
    expect((await mailed()).map(([address]) => address)).toEqual([
      'admin@example.com',
      'Editor@Example.com',
    ]);
  });

  test('approval and reply recipients may be dropped or add existing users, never past an unsubscribe', async () => {
    const { comments, publish, hooks, notices, drain, noticeState } = setup(
      true,
      undefined,
      {
        users: directory([
          { id: ADMIN.id, email: 'profile@example.com', role: 'administrator' },
          { id: 'watcher', email: 'watcher@example.com', role: 'subscriber' },
          { id: 'ann', email: 'ann@example.com', role: 'subscriber' },
        ]),
      },
    );
    const entry = await publish();

    await comments.updateDiscussion(
      { moderation: 'auto', notifyCommenters: true },
      ADMIN,
    );
    const parent = await comments.submit(comment(entry.id), visitor);

    await drain();
    let routes: Record<string, string[]> = {};

    hooks
      .registrar('routing')
      .filter('comment.notificationRecipients', (value) => ({
        ...value,
        to: routes[value.kind] ?? value.to,
      }));
    hooks.registrar('copy').filter('comment.notification', (value) => ({
      ...value,
      subject: `[watch] ${value.subject}`,
    }));
    notices.length = 0;
    routes = {
      reply: [],
      approved: ['profile@example.com', 'WATCHER@example.com'],
    };
    await comments.submit(reply(entry.id, parent.comment!.id), visitor);
    await drain();
    const sent = notices as EmailMessage[];

    expect(sent.map((notice) => notice.to).sort()).toEqual([
      'profile@example.com',
      'watcher@example.com',
    ]);
    expect(to(sent, 'watcher@example.com')[0]!.subject).toStartWith(
      '[watch] [Site] New comment',
    );
    // The unsubscribed parent author cannot be added back; a stranger invalidates the list.
    notices.length = 0;
    await noticeState.muteReplyMail(parent.comment!.id);
    routes = { reply: ['ann@example.com'], approved: ['stranger@example.com'] };
    await comments.submit(reply(entry.id, parent.comment!.id, 'Cy'), visitor);
    await drain();
    expect(sent.map((notice) => notice.to)).toEqual(['profile@example.com']);
  });

  test('an unsubscribed parent author is never added back by an approval notice, nor mailed after unsubscribing later', async () => {
    const {
      comments,
      notifier,
      publish,
      hooks,
      notices,
      drain,
      noticeState,
      queue,
      dropped,
    } = setup(true, undefined, {
      users: directory([
        { id: ADMIN.id, email: 'profile@example.com', role: 'administrator' },
        { id: 'ann', email: 'ann@example.com', role: 'subscriber' },
      ]),
    });
    const entry = await publish();

    await comments.updateDiscussion(
      { moderation: 'auto', notifyCommenters: true },
      ADMIN,
    );
    const muted = await comments.submit(comment(entry.id), visitor);
    const second = await comments.submit(comment(entry.id), visitor);

    await drain();
    hooks
      .registrar('routing')
      .filter('comment.notificationRecipients', (value) => ({
        ...value,
        to:
          value.kind === 'approved'
            ? ['profile@example.com', 'ann@example.com']
            : [],
      }));
    const sent = notices as EmailMessage[];

    // Already unsubscribed: the approval result naming the address is refused.
    await noticeState.muteReplyMail(muted.comment!.id);
    notices.length = 0;
    await comments.submit(reply(entry.id, muted.comment!.id), visitor);
    await drain();
    expect(sent.map((notice) => notice.to)).toEqual(['profile@example.com']);
    // Unsubscribing after the notice was planned stops the queued mail.
    notices.length = 0;
    dropped.length = 0;
    await comments.submit(reply(entry.id, second.comment!.id, 'Cy'), visitor);
    const fanOut = [...queue.rows.values()]
      .filter((row) => row.kind === COMMENT_NOTICE_JOB)
      .at(-1)!;

    await notifier.deliverNotice(structuredClone(fanOut.payload));
    await noticeState.muteReplyMail(second.comment!.id);
    await drain();
    expect(sent.map((notice) => notice.to)).toEqual(['profile@example.com']);
    expect(dropped).toEqual([
      { channel: 'email', reason: 'unsubscribed', notices: 1 },
    ]);
  });

  test('review mail carries the commenter address only for a recipient who moderates when it is sent', async () => {
    const people = new Map(
      [
        { id: ADMIN.id, email: 'admin@example.com', role: 'administrator' },
        { id: 'editor', email: 'editor@example.com', role: 'editor' },
      ].map((account) => [
        account.id,
        { ...userRecord(account), contentCount: 0 } as UserListItem,
      ]),
    );
    const { comments, publish, hooks, notices, drain } = setup(
      true,
      undefined,
      {
        users: {
          list: async () => [...people.values()],
          get: async (id) => people.get(id) ?? null,
        },
      },
    );
    const entry = await publish();

    await comments.updateDiscussion({ notifyModerators: false }, ADMIN);
    hooks
      .registrar('routing')
      .filter('comment.notificationRecipients', (value) => ({
        ...value,
        to: ['editor@example.com'],
      }));
    const sent = notices as EmailMessage[];
    const held = async () => {
      notices.length = 0;
      await comments.submit(comment(entry.id), visitor);
      await new Promise((resolve) => setTimeout(resolve, 20));
    };

    await held();
    await drain();
    expect(sent.map((notice) => notice.to)).toEqual(['editor@example.com']);
    expect(sent[0]!.text).toContain('ann@example.com');

    // Demoted after the mail was queued: it goes out without the address.
    await held();
    people.set('editor', { ...people.get('editor')!, role: 'subscriber' });
    await drain();
    expect(sent.map((notice) => notice.to)).toEqual(['editor@example.com']);
    expect(sent[0]!.text).not.toContain('ann@example.com');
  });

  test('users added to review mail are re-checked when it is sent', async () => {
    const people = new Map(
      [
        { id: ADMIN.id, email: 'admin@example.com', role: 'administrator' },
        { id: 'gone', email: 'gone@example.com', role: 'subscriber' },
        { id: 'moved', email: 'moved@example.com', role: 'subscriber' },
        { id: 'ann', email: 'ann@example.com', role: 'subscriber' },
        { id: 'kept', email: 'kept@example.com', role: 'subscriber' },
      ].map((account) => [
        account.id,
        { ...userRecord(account), contentCount: 0 } as UserListItem,
      ]),
    );
    const { comments, publish, hooks, notices, drain, noticeState, store } =
      setup(true, undefined, {
        users: {
          list: async () => [...people.values()],
          get: async (id) => people.get(id) ?? null,
        },
      });
    const entry = await publish();
    const at = new Date(Date.UTC(2025, 0, 1));

    await store.insert({
      id: 'parent',
      contentId: entry.id,
      parentId: null,
      userId: null,
      authorName: 'Ann',
      authorEmail: 'ann@example.com',
      authorUrl: '',
      authorIp: null,
      authorUserAgent: null,
      body: 'First',
      status: 'approved',
      fields: {},
      createdAt: at,
      updatedAt: at,
    });
    let routed = [
      'gone@example.com',
      'moved@example.com',
      'ann@example.com',
      'kept@example.com',
    ];

    hooks
      .registrar('routing')
      .filter('comment.notificationRecipients', (value) => ({
        ...value,
        to: value.kind === 'pending' ? routed : value.to,
      }));
    const sent = notices as EmailMessage[];
    const held = async () => {
      notices.length = 0;
      await comments.submit(reply(entry.id, 'parent'), visitor);
      await new Promise((resolve) => setTimeout(resolve, 20));
    };

    await held();
    // Before the queued mail goes out: one account is deleted, one changes its address, and
    // the parent comment's author unsubscribes from reply mail.
    people.delete('gone');
    people.set('moved', { ...people.get('moved')!, email: 'new@example.com' });
    await noticeState.muteReplyMail('parent');
    await drain();
    expect(sent.map((notice) => notice.to)).toEqual(['kept@example.com']);
    expect(sent[0]!.subject).toStartWith('[Site] Comment waiting for review');
    // Not a moderator: the commenter's address is left out.
    expect(sent[0]!.text).not.toContain('bob@example.com');
    // Once unsubscribed, a review result naming the address is refused: moderators get it.
    routed = ['ann@example.com'];
    await held();
    await drain();
    expect(sent.map((notice) => notice.to)).toEqual(['admin@example.com']);
    // A comment reviewed before its mail is sent is not announced as waiting.
    routed = ['kept@example.com'];
    await held();
    const waiting = (await comments.list({ status: 'pending' }, ADMIN)).items;

    await comments.bulk(
      { ids: waiting.map(({ id }) => id), action: 'approve' },
      ADMIN,
    );
    notices.length = 0;
    await drain();
    expect(to(sent, 'kept@example.com')).toHaveLength(0);
  });
});
