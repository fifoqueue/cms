import type { ContentDocument } from '@cms/sdk';

export interface RevisionRecord {
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

/** Saved versions of entries, and one autosave per user and entry. */
export interface RevisionRepository {
  /** Stores a revision and keeps only the newest `keep` revisions of the entry. */
  add(revision: RevisionWrite, keep: number): Promise<void>;
  /**
   * Replaces the user's autosave of the entry, under the content write lock, dated after the
   * entry's last save: an autosave that raced a save stays pending instead of looking stale.
   */
  autosave(revision: RevisionWrite): Promise<void>;
  /** Removes the user's autosave once the entry is saved. */
  clearAutosave(contentId: string, authorId: string): Promise<void>;
  /** Newest first, without documents. */
  list(
    contentId: string,
  ): Promise<Omit<RevisionRecord, 'document' | 'excerpt'>[]>;
  get(id: string): Promise<RevisionRecord | null>;
  /** The user's autosave of the entry, if any. */
  findAutosave(
    contentId: string,
    authorId: string,
  ): Promise<RevisionRecord | null>;
}
