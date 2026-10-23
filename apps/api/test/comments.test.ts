import { describe, expect, test } from 'bun:test';
import { DEFAULT_SECURITY_SETTINGS } from '@cms/sdk';
import type { ContentInput } from '@cms/sdk';
import { CommentService } from '#api/domain/comments/comment-service';
import { ContentLocks } from '#api/domain/content/content-locks';
import { MemoryPublishedContentRepository } from '#test/support/memory-published';
import { hmacSigner } from '#api/infra/hmac-signer';
import { randomTokenIssuer } from '#api/infra/system';
import { ContentService } from '#api/domain/content/content-service';
import { ProtectionService } from '#api/domain/security/protection-service';
import { SecuritySettingsService } from '#api/domain/security/security-settings';
import { tiptapRenderer } from '#api/infra/system';
import { HookBus } from '#api/plugin-runtime/hook-bus';
import type { DomainError } from '#api/shared/errors';
import {
  ADMIN,
  MemoryContentRepository,
  MemorySettings,
  fixedClock,
  noUsers,
  plainHasher,
  recordingLogger,
  sequentialIds,
  testFields,
  testTypes,
  userRecord,
} from '#test/support/memory';
import { MemoryCommentRepository } from '#test/support/memory-comments';
import { MemoryRevisionRepository } from '#test/support/memory-revisions';
import {
  MemoryRateLimitStore,
  plainSecretBox,
} from '#test/support/memory-security';

const codeOf = (promise: Promise<unknown>) =>
  promise.then(
    () => 'ok',
    (error: DomainError) => error.code,
  );

const setup = () => {
  const repository = new MemoryContentRepository();
  const ids = sequentialIds();
  const clock = fixedClock();
  const hooks = new HookBus({
    timeoutMs: 50,
    logger: recordingLogger().logger,
  });
  const settings = new MemorySettings();
  const types = testTypes(settings);
  const content = new ContentService({
    repository,
    renderer: tiptapRenderer,
    hooks,
    ids,
    clock,
    users: noUsers,
    revisions: new MemoryRevisionRepository(),
    hasher: plainHasher,
    types,
    fields: testFields(),
  });
  const store = new MemoryCommentRepository(repository);
  const security = new SecuritySettingsService(settings, plainSecretBox);
  const signer = hmacSigner('comment-test-key');
  const locks = new ContentLocks({
    repository: new MemoryPublishedContentRepository(repository),
    hasher: plainHasher,
    signer,
    clock,
  });
  const comments = new CommentService({
    locks,
    signer,
    digest: randomTokenIssuer.digest,
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
    email: { enabled: async () => false, queue: async () => undefined },
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
  });
  const publish = (overrides: Partial<ContentInput> = {}) =>
    content.create(
      {
        type: 'post',
        title: 'Hello',
        status: 'published',
        document: {
          type: 'doc',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Body' }] },
          ],
        },
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
      `https://www.gravatar.com/avatar/${randomTokenIssuer.digest('ann@example.com')}?d=identicon&s=96`,
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
      { requireLogin: true, moderation: 'auto' },
      ADMIN,
    );
    expect(await codeOf(comments.submit(comment(entry.id), visitor))).toBe(
      'forbidden',
    );
    const sent = await comments.submit(
      comment(entry.id, {
        authorName: 'Impostor',
        authorEmail: 'other@example.com',
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
    });
    expect(sent.comment).toMatchObject({
      byAuthor: true,
      authorName: 'Profile name',
    });
    expect(JSON.stringify(sent)).not.toContain('profile@example.com');
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

    expect((await comments.submit(comment(entry.id), visitor)).status).toBe(
      'pending',
    );
    const spam = await comments.submit(
      comment(entry.id, { body: 'Best CASINO' }),
      visitor,
    );
    expect(spam.status).toBe('pending');
    expect((await comments.counts(ADMIN)).spam).toBe(1);

    const [first] = (await comments.list({ status: 'pending' }, ADMIN)).items;
    await comments.bulk({ ids: [first!.id], action: 'approve' }, ADMIN);
    expect(repository.commentCounts.get(entry.id)).toBe(1);
    // Known authors skip the queue, unless a hold word appears.
    expect((await comments.submit(comment(entry.id), visitor)).status).toBe(
      'approved',
    );
    expect(
      (await comments.submit(comment(entry.id, { body: 'refund?' }), visitor))
        .status,
    ).toBe('pending');
    expect(repository.commentCounts.get(entry.id)).toBe(2);

    // Replies stay when their parent is deleted.
    const reply = await comments.submit(
      comment(entry.id, { parentId: first!.id, body: 'Agreed' }),
      visitor,
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
