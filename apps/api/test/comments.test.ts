import { describe, expect, test } from 'bun:test';
import { DEFAULT_SECURITY_SETTINGS } from '@cms/sdk';
import type { ContentInput } from '@cms/sdk';
import { CommentService } from '#api/domain/comments/comment-service';
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
  const comments = new CommentService({
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
    users: { list: async () => [], get: async () => null },
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
  return { content, comments, store, hooks, security, repository, publish };
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
    ).toEqual({ status: 'pending', comment: null });
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
