import type { DiscussionSettings } from '#sdk/comments';
import type { PublicComment, CommentListQuery } from '#sdk/comments';
import type { PluginComment } from '#sdk/plugin';
import type { Awaitable } from '#sdk/common';

export interface CommentCheck {
  comment: Pick<
    PluginComment,
    'contentId' | 'authorName' | 'authorEmail' | 'authorUrl' | 'body'
  >;
  settings: DiscussionSettings;
  known: boolean;
  moderator: boolean;
}
export interface CommentVerdict {
  status: 'approve' | 'hold' | 'spam';
  reasons: string[];
}
export interface CommentChecker {
  check(input: CommentCheck): Awaitable<CommentVerdict>;
}
export interface CommentCheckerRegistrar {
  register(checker: CommentChecker): () => void;
}

export interface CommentActionHooks {
  'discussion.updated': DiscussionSettings;
  'comment.updated': PluginComment;
  'comment.deleted': PluginComment;
}

export interface CommentFilterHooks {
  'discussion.beforeSave': DiscussionSettings;
  'comment.query': CommentListQuery;
  'comment.public': PublicComment;
  'comment.notification': { to: string; subject: string; text: string };
  'comment.submitAllowed': {
    allowed: boolean;
    contentId: string;
    authorName: string;
    authorEmail: string;
    address: string | null;
  };
}
