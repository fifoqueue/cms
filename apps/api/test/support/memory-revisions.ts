import type {
  RevisionRecord,
  RevisionRepository,
  RevisionWrite,
} from '#api/domain/content/revisions';

/** Same contract as `PrismaRevisionRepository`. */
export class MemoryRevisionRepository implements RevisionRepository {
  readonly rows: RevisionRecord[] = [];

  async add(revision: RevisionWrite, keep: number) {
    this.rows.push({
      ...structuredClone(revision),
      authorName: revision.authorId ?? '',
    });
    const own = this.newestFirst(revision.contentId).filter(
      (row) => row.kind === 'revision',
    );
    for (const stale of own.slice(keep))
      this.rows.splice(this.rows.indexOf(stale), 1);
  }

  /** The entries' last save times, for dating autosaves after them (set when a test wires it). */
  saves?: { savedAt(contentId: string): Date | undefined };

  async autosave(revision: RevisionWrite) {
    await this.clearAutosave(revision.contentId, revision.authorId!);
    const saved = this.saves?.savedAt(revision.contentId);
    this.rows.push({
      ...structuredClone(revision),
      createdAt:
        saved && revision.createdAt <= saved
          ? new Date(saved.getTime() + 1)
          : revision.createdAt,
      authorName: revision.authorId ?? '',
    });
  }

  async clearAutosave(contentId: string, authorId: string) {
    for (const row of [...this.rows])
      if (
        row.contentId === contentId &&
        row.authorId === authorId &&
        row.kind === 'autosave'
      )
        this.rows.splice(this.rows.indexOf(row), 1);
  }

  async list(contentId: string) {
    return this.newestFirst(contentId).map(
      ({ document: _document, excerpt: _excerpt, ...row }) => row,
    );
  }

  async get(id: string) {
    return structuredClone(this.rows.find((row) => row.id === id) ?? null);
  }

  async findAutosave(contentId: string, authorId: string) {
    return structuredClone(
      this.rows.find(
        (row) =>
          row.contentId === contentId &&
          row.authorId === authorId &&
          row.kind === 'autosave',
      ) ?? null,
    );
  }

  private newestFirst(contentId: string) {
    return this.rows
      .filter((row) => row.contentId === contentId)
      .sort(
        (a, b) =>
          b.createdAt.getTime() - a.createdAt.getTime() ||
          (a.id < b.id ? 1 : -1),
      );
  }
}
