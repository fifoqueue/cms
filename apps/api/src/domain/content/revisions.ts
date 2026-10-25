import type { ContentDocument } from '@cms/sdk';
import type { ContentRecord } from '#api/domain/content/content-repository';

export type RevisionDeleteGuard = Pick<
  ContentRecord,
  'updatedAt' | 'authorId' | 'status'
>;

export interface RevisionRecord {
  ip?: string | null;
  userAgent?: string | null;
  id: string;
  contentId: string;
  authorId: string | null;
  authorName: string;
  kind: 'revision' | 'autosave';
  title: string;
  excerpt: string;
  document: ContentDocument;
  createdAt: Date;
}

export type RevisionWrite = Omit<RevisionRecord, 'authorName'>;

/** History policy and attribution, committed atomically by the content store. */
export interface RevisionSave {
  ip?: string | null;
  userAgent?: string | null;
  id: string;
  authorId: string;
  keep: number;
  clearAutosave: boolean;
}

/** Saved versions of entries, and one autosave per user and entry. */
export interface RevisionRepository {
  /**
   * Replaces the user's autosave of the entry, under the content write lock, dated after the
   * entry's last save: an autosave that raced a save stays pending instead of looking stale.
   */
  autosave(revision: RevisionWrite): Promise<void>;
  /** Deletes one saved revision under the content lock, checking the authorized snapshot. */
  delete(
    contentId: string,
    id: string,
    guard: RevisionDeleteGuard,
  ): Promise<void>;
  /** Newest first, without documents. */
  list(
    contentId: string,
  ): Promise<Omit<RevisionRecord, 'document' | 'excerpt'>[]>;
  get(id: string): Promise<RevisionRecord | null>;
  /**
   * The user's autosave newer than the durable text-save watermark `savedAt`.
   * Status-only changes and history deletion never change that watermark.
   */
  pendingAutosave(
    contentId: string,
    authorId: string,
    savedAt: Date,
  ): Promise<RevisionRecord | null>;
  /** The user's autosave of the entry, if any. */
  findAutosave(
    contentId: string,
    authorId: string,
  ): Promise<RevisionRecord | null>;
}
