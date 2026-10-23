import type { CommentStatus } from '@cms/sdk';

export interface CommentRecord {
  id: string;
  contentId: string;
  parentId: string | null;
  /** The signed-in user who wrote it, if any. */
  userId: string | null;
  authorName: string;
  /** Lowercase. Never public. */
  authorEmail: string;
  /** Empty when none. */
  authorUrl: string;
  /** Plain text. */
  body: string;
  status: CommentStatus;
  createdAt: Date;
  updatedAt: Date;
}

/** An entry that can be commented on: public (published, not trashed). */
export interface CommentTarget {
  id: string;
  type: string;
  title: string;
  path: string;
  publishedAt: Date | null;
  allowComments: boolean;
  protected: boolean;
  authorId: string;
  /** Approved comments. */
  commentCount: number;
}

export interface ThreadRecord extends CommentRecord {
  /** 0 for top-level comments. */
  depth: number;
}

export interface CommentCriteria {
  /** Without a status: pending and approved. */
  status?: CommentStatus;
  contentId?: string;
  /** Substring of the author name, email or body. */
  search?: string;
  page: number;
  pageSize: number;
}

export type CommentChanges = Partial<
  Pick<
    CommentRecord,
    'status' | 'authorName' | 'authorEmail' | 'authorUrl' | 'body'
  >
>;

/**
 * Stored comments. Every write that changes which comments are approved updates the entry's
 * `commentCount` in the same transaction.
 */
export interface CommentRepository {
  target(contentId: string): Promise<CommentTarget | null>;
  findById(id: string): Promise<CommentRecord | null>;
  /** Page containing this top-level comment, ordered by creation time then id. */
  pageOf(root: CommentRecord, pageSize: number): Promise<number>;
  insert(record: CommentRecord): Promise<void>;
  /**
   * Approved comments of an entry: a page of top-level comments, oldest first, each followed by
   * its approved replies down to `depth` levels (thread order). `total` counts top-level ones.
   */
  thread(
    contentId: string,
    page: number,
    pageSize: number,
    depth: number,
  ): Promise<{ items: ThreadRecord[]; total: number; truncated: boolean }>;
  /** Newest first, with the entry's title. */
  list(criteria: CommentCriteria): Promise<{
    items: (CommentRecord & {
      contentTitle: string;
      parentAuthor: string | null;
    })[];
    total: number;
  }>;
  /** Comments after `afterId`, ordered by id for a streaming WXR export. */
  exportPage(
    contentId: string,
    afterId: string | null,
    limit: number,
  ): Promise<CommentRecord[]>;
  counts(): Promise<Record<CommentStatus, number>>;
  /** Returns the comment before and after the change; null when it does not exist. */
  update(
    id: string,
    changes: CommentChanges,
    at: Date,
  ): Promise<{ before: CommentRecord; after: CommentRecord } | null>;
  /** Changes the status of the comments among `ids` that exist; returns them as they were. */
  setStatus(
    ids: readonly string[],
    status: CommentStatus,
    at: Date,
  ): Promise<CommentRecord[]>;
  /** Deletes the comments among `ids`; their replies move up to the deleted comment's parent. */
  delete(ids: readonly string[]): Promise<CommentRecord[]>;
  /** Whether this email has an approved comment. */
  hasApproved(email: string): Promise<boolean>;
  /** Newest approved comments on public entries. */
  recent(
    limit: number,
  ): Promise<{ author: string; title: string; path: string }[]>;
  /** Deletes spam and trashed comments last changed before `before`; returns how many. */
  purge(before: Date, limit: number): Promise<number>;
}
