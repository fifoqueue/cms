import { describe, expect, test } from 'bun:test';
import { DEFAULT_SECURITY_SETTINGS } from '@cms/sdk';
import type { ContentInput } from '@cms/sdk';
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
  const comments = new CommentService({
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
    email: {
      enabled: async () => mail,
      queue: async (message) => {
        notices.push(message);
      },
    },
    users: {
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
    },
    site: async () => ({ siteUrl: '', title: 'Site', locale: 'en' }),
    ids,
    clock,
    ...recipients,
  });
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
  test('moderator mail resolves capabilities for the recipient identity', async () => {
    const calls: unknown[] = [];
    const { comments, publish, notices } = setup(true, undefined, {
      users: {
        list: async () => [
          {
            ...userRecord({
              id: 'recipient',
              role: 'author',
              email: 'moderator@example.com',
            }),
            contentCount: 0,
          },
        ],
        get: async () => null,
      },
      roles: {
        capabilities: async (role, id) => {
          calls.push([role, id]);
          return id === 'recipient' ? ['comments.moderate'] : [];
        },
      },
    });
    const entry = await publish();
    await comments.submit(comment(entry.id), visitor);
    // Notification dispatch intentionally outlives the submit response.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(calls).toEqual([['author', 'recipient']]);
    expect(notices).toContainEqual(
      expect.objectContaining({ to: 'moderator@example.com' }),
    );
  });
  test('moderators bypass checkers but still pass through beforeSave', async () => {
    let calls = 0;
    const { comments, publish, hooks } = setup(false, {
      check: async (input) => {
        calls++;
        expect(Object.keys(input.comment).sort()).toEqual([
          'authorEmail',
          'authorName',
          'authorUrl',
          'body',
          'contentId',
        ]);
        return { status: 'spam', reasons: [] };
      },
    });
    const entry = await publish();
    hooks.registrar('test').filter('comment.beforeSave', (value) => ({
      ...value,
      body: 'Filtered',
    }));
    const submitted = await comments.submit(
      comment(entry.id),
      visitor,
      [],
      ADMIN,
    );
    expect(submitted.status).toBe('approved');
    expect(submitted.comment!.body).toBe('Filtered');
    expect(calls).toBe(0);
    await comments.submit(comment(entry.id), visitor);
    expect(calls).toBe(1);
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
  test('notifications filter outgoing content and reject invalid addresses', async () => {
    const { comments, publish, hooks, notices } = setup(true);
    const entry = await publish();
    await comments.updateDiscussion(
      { moderation: 'auto', notifyAuthors: true },
      ADMIN,
    );
    const plugin = hooks.registrar('notice');
    plugin.filter('comment.notification', (notice) => {
      expect(notice.to).toBe('profile@example.com');
      expect(notice.text).toContain('Nice post');
      return { ...notice, subject: 'Custom notice', text: 'Custom body' };
    });
    plugin.filter(
      'comment.notification',
      (notice) => ({ ...notice, to: 'other@example.com' }),
      20,
    );
    await comments.submit(comment(entry.id), visitor);
    // Notifications are intentionally fire-and-forget.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(notices).toMatchObject([
      {
        to: 'profile@example.com',
        subject: 'Custom notice',
        text: 'Custom body',
      },
    ]);
  });

  test('reply creation, bulk moderation, bulk deletion and purge emit per committed row', async () => {
    const { comments, publish, hooks, store } = setup();
    const entry = await publish();
    await comments.updateDiscussion({ moderation: 'auto' }, ADMIN);
    const first = (await comments.submit(comment(entry.id), visitor)).comment!;
    const second = (
      await comments.submit(comment(entry.id, { body: 'Second' }), visitor)
    ).comment!;
    const created: unknown[] = [];
    const changed: unknown[] = [];
    const deleted: unknown[] = [];
    const plugin = hooks.registrar('events');
    plugin.on('comment.created', (value) => {
      created.push(value);
    });
    plugin.on('comment.statusChanged', (value) => {
      changed.push(value);
    });
    plugin.on('comment.deleted', (value) => {
      deleted.push(value);
    });
    await comments.reply(first.id, { body: 'Reply' }, ADMIN);
    expect(created).toMatchObject([
      { parentId: first.id, body: 'Reply', status: 'approved' },
    ]);
    await comments.bulk({ ids: [first.id, second.id], action: 'spam' }, ADMIN);
    expect(changed).toMatchObject([
      { id: first.id, previousStatus: 'approved', status: 'spam' },
      { id: second.id, previousStatus: 'approved', status: 'spam' },
    ]);
    await comments.bulk({ ids: [first.id], action: 'delete' }, ADMIN);
    await store.update(second.id, { status: 'trash' }, new Date('2000-01-01'));
    await comments.purge();
    expect(deleted).toMatchObject([
      { id: first.id, status: 'spam' },
      { id: second.id, status: 'trash' },
    ]);
    expect(await store.findById(second.id)).toBeNull();
  });
  test('submission refusal cannot be reversed by a later filter', async () => {
    const { comments, publish, hooks } = setup();
    const entry = await publish();
    const plugin = hooks.registrar('admission');
    plugin.filter('comment.submitAllowed', (value) => {
      expect(value.contentId).toBe(entry.id);
      expect(value.authorEmail).toBe('ann@example.com');
      expect(value.address).toBeNull();
      return { ...value, allowed: false };
    });
    plugin.filter(
      'comment.submitAllowed',
      (value) => ({ ...value, allowed: true }),
      20,
    );
    expect(await codeOf(comments.submit(comment(entry.id), visitor))).toBe(
      'forbidden',
    );
    expect((await comments.list({}, ADMIN)).total).toBe(0);
  });
  test('discussion, query, public, edit and deletion hooks preserve validated boundaries', async () => {
    const { comments, publish, hooks } = setup();
    const plugin = hooks.registrar('comments');
    const settings: unknown[] = [];
    const updates: unknown[] = [];
    const deletions: unknown[] = [];
    plugin.on('discussion.updated', (value) => {
      settings.push(value);
    });
    plugin.on('comment.updated', (value) => {
      updates.push(value);
    });
    plugin.on('comment.deleted', (value) => {
      deletions.push(value);
    });
    plugin.filter('discussion.beforeSave', (value) => ({
      ...value,
      moderation: 'auto' as const,
    }));
    plugin.filter(
      'discussion.beforeSave',
      (value) => ({ ...value, pageSize: -1 }),
      20,
    );
    const saved = await comments.updateDiscussion({}, ADMIN);
    expect(saved.moderation).toBe('auto');
    expect(settings).toEqual([saved]);
    const entry = await publish();
    const sent = await comments.submit(comment(entry.id), visitor);
    const id = sent.comment!.id;
    plugin.filter('comment.public', (value) => ({
      ...value,
      body: 'Filtered',
    }));
    expect((await comments.publicPage(entry.id, 1)).items[0]!.body).toBe(
      'Filtered',
    );
    plugin.filter('comment.query', (value) => ({
      ...value,
      search: 'no-match',
    }));
    expect((await comments.list({}, ADMIN)).total).toBe(0);
    await comments.update(id, { body: 'Edited' }, ADMIN);
    expect(updates).toMatchObject([{ id, body: 'Edited' }]);
    await comments.remove(id, ADMIN);
    expect(deletions).toMatchObject([{ id, body: 'Edited' }]);
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

  test('disabled identity fields are ignored independently and names require a configured default', async () => {
    const { comments, publish, store } = setup();
    const entry = await publish();
    expect(
      await codeOf(comments.updateDiscussion({ showName: false }, ADMIN)),
    ).toBe('invalid_input');
    expect(
      await codeOf(
        comments.updateDiscussion({ showName: false, defaultName: ' ' }, ADMIN),
      ),
    ).toBe('invalid_input');
    expect(
      await codeOf(
        comments.updateDiscussion(
          { showEmail: false },
          { id: 'writer', role: 'author' },
        ),
      ),
    ).toBe('forbidden');
    for (const [setting, field, expected] of [
      ['showName', 'authorName', 'Guest'],
      ['showEmail', 'authorEmail', ''],
      ['showWebsite', 'authorUrl', ''],
    ] as const) {
      await comments.updateDiscussion(
        { [setting]: false, defaultName: 'Guest', moderation: 'auto' },
        ADMIN,
      );
      const sent = await comments.submit(
        comment(entry.id, { [field]: { malicious: true } }),
        visitor,
      );
      expect(store.rows.get(sent.comment!.id)?.[field]).toBe(expected);
    }
    await comments.updateDiscussion({}, ADMIN);
    expect(
      await codeOf(
        comments.submit(comment(entry.id, { authorName: '' }), visitor),
      ),
    ).toBe('invalid_input');
    expect(
      await codeOf(
        comments.submit(comment(entry.id, { authorEmail: '' }), visitor),
      ),
    ).toBe('invalid_input');
  });

  test('comments without email never share approved identity, commenter proofs or avatars', async () => {
    const { comments, publish, store } = setup();
    const entry = await publish();
    await comments.updateDiscussion(
      { showEmail: false, moderation: 'auto', showAvatars: true },
      ADMIN,
    );
    const first = await comments.submit(comment(entry.id), visitor);
    expect(first.commenterProof).toBeNull();
    expect(first.comment?.avatarUrl).toBeNull();
    expect(store.rows.get(first.comment!.id)?.authorEmail).toBe('');
    await comments.updateDiscussion(
      { showEmail: false, moderation: 'known' },
      ADMIN,
    );
    const second = await comments.submit(
      comment(entry.id, { authorEmail: 'another@example.com' }),
      visitor,
    );
    expect(second.status).toBe('pending');
    expect(second.commenterProof).toBeNull();
    // Moderators can edit an existing email-less comment without inventing an email.
    await comments.update(
      first.comment!.id,
      { body: 'Edited', authorEmail: '' },
      ADMIN,
    );
    expect(store.rows.get(first.comment!.id)?.body).toBe('Edited');
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

  test('plugins may mark spam but cannot reassign a comment; failing filters change nothing', async () => {
    const { comments, store, publish, hooks } = setup();
    const entry = await publish();
    const other = await publish({ title: 'Other' });
    await comments.updateDiscussion({ moderation: 'auto' }, ADMIN);
    const plugin = hooks.registrar('spam-check');
    const off = plugin.filter('comment.beforeSave', (draft) => ({
      ...draft,
      contentId: other.id,
      authorName: 'Someone else',
      status: draft.body.includes('buy') ? 'spam' : draft.status,
    }));
    plugin.filter('comment.beforeSave', () => {
      throw new Error('boom');
    });

    await comments.submit(comment(entry.id, { body: 'buy now' }), visitor);
    await comments.submit(comment(entry.id, { body: 'hello' }), visitor);
    const rows = [...store.rows.values()];
    expect(
      rows.map((row) => [row.contentId, row.authorName, row.status]),
    ).toEqual([
      [entry.id, 'Ann', 'spam'],
      [entry.id, 'Ann', 'approved'],
    ]);
    off();
    expect(
      (await comments.submit(comment(entry.id, { body: 'buy' }), visitor))
        .status,
    ).toBe('approved');
  });

  test('visitors the frontend did not vouch for share one rate limit', async () => {
    const { comments, publish, security } = setup();
    const entry = await publish();
    await security.update({
      captcha: DEFAULT_SECURITY_SETTINGS.captcha,
      rules: {
        ...DEFAULT_SECURITY_SETTINGS.rules,
        commentClient: {
          enabled: true,
          max: 2,
          windowSeconds: 600,
          blockSeconds: 600,
          enforcement: 'block',
        },
      },
    });
    const unproven = { client: null, address: null, captchaToken: null };
    await comments.submit(comment(entry.id), unproven);
    await comments.submit(comment(entry.id), { ...unproven });
    expect(await codeOf(comments.submit(comment(entry.id), unproven))).toBe(
      'rate_limited',
    );
    // A proven visitor has a limit of their own.
    expect(await codeOf(comments.submit(comment(entry.id), visitor))).toBe(
      'ok',
    );
  });
});
