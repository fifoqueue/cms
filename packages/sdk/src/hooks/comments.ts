import type { DiscussionSettings } from '#sdk/comments';
import type {
  CommentPushPayload,
  PublicComment,
  CommentListQuery,
} from '#sdk/comments';
import type { PluginComment } from '#sdk/plugin';
import type { Awaitable } from '#sdk/common';

export interface CommentCheck {
  comment: Pick<
    PluginComment,
    | 'contentId'
    | 'authorName'
    | 'authorEmail'
    | 'authorUrl'
    | 'authorIp'
    | 'authorUserAgent'
    | 'body'
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

/** `comment.publicQuery`: which page of an entry's top-level comments is read, and in what order. */
export interface CommentPublicQuery {
  /** Fixed by core. */
  contentId: string;
  /** The asked page, 1 to `PAGINATION_MAX_PAGE`; fixed by core. */
  page: number;
  /**
   * Top-level comments per page, 1 to 200; replies follow their comment. Page 1's result sets
   * it and `order` for the entry; later pages start from them and must keep them.
   */
  pageSize: number;
  /** Of top-level comments by creation time; replies stay oldest first. */
  order: 'asc' | 'desc';
}

/** What a notification mail is about: a held comment, an approved one, or a reply. */
export type CommentNoticeKind = 'pending' | 'approved' | 'reply';

/**
 * `comment.notificationRecipients`: who is mailed about a comment. Handlers may drop any address
 * and add only addresses of existing user accounts, never that of a parent comment's author who
 * unsubscribed from reply mail; any other address invalidates the result. Added users are
 * re-checked when their mail is sent.
 */
export interface CommentNoticeRecipients {
  /** Fixed by core. */
  commentId: string;
  /** Fixed by core. */
  kind: CommentNoticeKind;
  to: string[];
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
  /** Browser push before it is queued; `url` and `tag` are fixed by core. */
  'comment.push': CommentPushPayload;
  /** Core supplies the initial decision; handlers may allow or refuse. Shape and identity stay validated. */
  'comment.submitAllowed': {
    allowed: boolean;
    contentId: string;
    authorName: string;
    authorEmail: string;
    address: string | null;
  };
  /**
   * Whether an entry takes comments. Core supplies the initial decision; handlers may open or
   * close. `contentId` and the entry's content `type` stay fixed.
   */
  'comment.openAllowed': { contentId: string; type: string; allowed: boolean };
  /** The public thread page read; revalidated. */
  'comment.publicQuery': CommentPublicQuery;
  /** Notification mail recipients. */
  'comment.notificationRecipients': CommentNoticeRecipients;
}
