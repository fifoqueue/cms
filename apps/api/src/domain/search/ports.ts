/** What the search index stores for a public entry. Results are only ids; pages load from MariaDB. */
export interface SearchDocument {
  id: string;
  type: string;
  title: string;
  excerpt: string;
  /** Plain text of the body; empty while a password protects it. */
  text: string;
  /** Slugs of assigned categories and all their ancestors, so a category matches its subtree. */
  categories: string[];
  tags: string[];
  /** Unix seconds. */
  publishedAt: number;
  sticky: boolean;
}

export interface SearchConnection {
  host: string;
  apiKey: string;
  /** The index that public searches read. */
  index: string;
}

/** The filters a search engine answers; others make the database answer. */
export interface SearchQuery {
  text: string;
  types?: readonly string[];
  category?: string;
  tag?: string;
  year?: number;
  month?: number;
  sticky?: 'only' | 'exclude';
  page: number;
  pageSize: number;
}

/** A full-text engine. Every write resolves only after the engine has applied it. */
export interface SearchEngine {
  version(connection: SearchConnection): Promise<string>;
  /** Replaces every document at once: the new index is built aside and swapped in. */
  rebuild(
    connection: SearchConnection,
    batches: AsyncIterable<SearchDocument[]>,
  ): Promise<void>;
  upsert(
    connection: SearchConnection,
    documents: readonly SearchDocument[],
  ): Promise<void>;
  remove(connection: SearchConnection, ids: readonly string[]): Promise<void>;
  /** Ids in ranking order and the number of matches. */
  search(
    connection: SearchConnection,
    query: SearchQuery,
  ): Promise<{ ids: string[]; total: number }>;
  count(connection: SearchConnection): Promise<number>;
}

/** A queued change: an entry to refresh, or `null` for a full rebuild. */
export interface OutboxEntry {
  id: number;
  contentId: string | null;
}

/**
 * The database side of the index: the outbox that content writes fill in their own transaction,
 * and public entries rendered as documents.
 */
export interface SearchSource {
  /** Oldest first. */
  pending(limit: number): Promise<OutboxEntry[]>;
  countPending(): Promise<number>;
  /** The newest entry id, or 0. */
  lastId(): Promise<number>;
  /** Removes entries up to and including `id`. */
  acknowledge(id: number): Promise<void>;
  requestRebuild(): Promise<void>;
  /** Public entries among `ids`; the others are not public (or gone). */
  documents(ids: readonly string[]): Promise<SearchDocument[]>;
  /** Public entries in id order, after `afterId`. */
  page(afterId: string | null, limit: number): Promise<SearchDocument[]>;
}
