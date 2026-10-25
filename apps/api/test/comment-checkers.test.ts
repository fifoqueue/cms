import { expect, test } from 'bun:test';
import { discussionSettingsSchema } from '@cms/sdk';
import { CommentCheckers } from '#api/domain/comments/comment-checkers';
import { PluginScope } from '#api/plugin-runtime/plugin-scope';

test('checkers combine verdicts, ignore failure, and revoke to core moderation', async () => {
  const registry = new CommentCheckers(10);
  const input = {
    comment: {
      contentId: 'post',
      authorName: 'A',
      authorEmail: '',
      authorUrl: '',
      body: 'Hi',
    },
    settings: discussionSettingsSchema.parse({ moderation: 'manual' }),
    known: false,
    moderator: false,
  };
  registry.register({
    check: () => {
      throw new Error('offline');
    },
  });
  registry.register({ check: async () => new Promise(() => {}) });
  const scope = new PluginScope();
  scope.track(() =>
    registry.register({
      check: () => ({ status: 'spam', reasons: ['abuse'] }),
    }),
  );
  expect(await registry.check(input)).toEqual({
    status: 'spam',
    reasons: ['abuse'],
  });
  scope.dispose();
  expect(await registry.check(input)).toEqual({ status: 'hold', reasons: [] });
});
