import type {
  OutboxEntry,
  SearchConnection,
  SearchDocument,
  SearchEngine,
  SearchQuery,
  SearchSource,
} from '#api/domain/search/ports';

/** Same contract as `PrismaSearchSource`; tests set `documents` (the public entries) directly. */
export class MemorySearchSource implements SearchSource {
  readonly documentsById = new Map<string, SearchDocument>();
  outbox: OutboxEntry[] = [];
  private next = 1;

  /** Simulates a content write: the entry changes and is queued in one step. */
  write(document: SearchDocument | { id: string; removed: true }) {
    if ('removed' in document) this.documentsById.delete(document.id);
    else this.documentsById.set(document.id, document);
    this.outbox.push({ id: this.next++, contentId: document.id });
  }

  async pending(limit: number) {
    return this.outbox.slice(0, limit);
  }

  async countPending() {
    return this.outbox.length;
  }

  async lastId() {
    return this.outbox.at(-1)?.id ?? 0;
  }

  async acknowledge(id: number) {
    this.outbox = this.outbox.filter((entry) => entry.id > id);
  }

  async requestRebuild() {
    this.outbox.push({ id: this.next++, contentId: null });
  }

  async documents(ids: readonly string[]) {
    return ids.flatMap((id) => {
      const document = this.documentsById.get(id);
      return document ? [document] : [];
    });
  }

  async page(afterId: string | null, limit: number) {
    return [...this.documentsById.values()]
      .sort((a, b) => a.id.localeCompare(b.id))
      .filter((document) => afterId === null || document.id > afterId)
      .slice(0, limit);
  }
}

/** An engine keeping one index per name; `failing` makes every call throw (that error, if one). */
export class MemorySearchEngine implements SearchEngine {
  readonly indexes = new Map<string, Map<string, SearchDocument>>();
  failing: boolean | Error = false;

  private index(connection: SearchConnection) {
    if (this.failing)
      throw this.failing instanceof Error
        ? this.failing
        : new Error('connection refused');
    let index = this.indexes.get(connection.index);
    if (!index) this.indexes.set(connection.index, (index = new Map()));
    return index;
  }

  async version(connection: SearchConnection) {
    this.index(connection);
    return '1.0.0';
  }

  async rebuild(
    connection: SearchConnection,
    batches: AsyncIterable<SearchDocument[]>,
  ) {
    this.index(connection);
    const next = new Map<string, SearchDocument>();
    for await (const batch of batches)
      for (const document of batch) next.set(document.id, document);
    this.indexes.set(connection.index, next);
  }

  async upsert(
    connection: SearchConnection,
    documents: readonly SearchDocument[],
  ) {
    const index = this.index(connection);
    for (const document of documents) index.set(document.id, document);
  }

  async remove(connection: SearchConnection, ids: readonly string[]) {
    const index = this.index(connection);
    for (const id of ids) index.delete(id);
  }

  async search(connection: SearchConnection, query: SearchQuery) {
    const needle = query.text.toLowerCase();
    const ids = [...this.index(connection).values()]
      .filter(
        (document) =>
          `${document.title} ${document.text}`.toLowerCase().includes(needle) &&
          (!query.types || query.types.includes(document.type)),
      )
      .map((document) => document.id);
    return {
      ids: ids.slice(
        (query.page - 1) * query.pageSize,
        query.page * query.pageSize,
      ),
      total: ids.length,
    };
  }

  async count(connection: SearchConnection) {
    return this.index(connection).size;
  }
}
