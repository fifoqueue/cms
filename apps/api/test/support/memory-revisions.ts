import type {
  RevisionRecord,
  RevisionRepository,
  RevisionWrite,
} from '#api/domain/content/revisions';

/** The content store whose write queue autosaves share (the Prisma adapter's content lock). */
export interface MemoryContentWrites {
  exclusive<T>(task: () => Promise<T>): Promise<T>;
  savedAt(contentId: string): Date | undefined;
}

/** Same contract as `PrismaRevisionRepository`. Built by `MemoryContentRepository`. */
export class MemoryRevisionRepository implements RevisionRepository {
  readonly rows: RevisionRecord[] = [];

  constructor(private readonly content: MemoryContentWrites) {}

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

  /** In the content write queue, dated after the entry's last save. */
  autosave(revision: RevisionWrite) {
    return this.content.exclusive(async () => this.replaceAutosave(revision));
  }

  private replaceAutosave(revision: RevisionWrite) {
    this.clearNow(revision.contentId, revision.authorId!);
    const saved = this.content.savedAt(revision.contentId);
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
    this.clearNow(contentId, authorId);
  }

  /** The user's autosave newer than the entry's newest revision (else `savedAt`). */
  pendingNow(contentId: string, authorId: string, savedAt: Date) {
    const rows = this.newestFirst(contentId);
    const autosave = rows.find(
      (row) => row.kind === 'autosave' && row.authorId === authorId,
    );
    const baseline =
      rows.find((row) => row.kind === 'revision')?.createdAt ?? savedAt;
    return autosave && autosave.createdAt > baseline ? autosave : null;
  }

  async pendingAutosave(contentId: string, authorId: string, savedAt: Date) {
    return structuredClone(this.pendingNow(contentId, authorId, savedAt));
  }

  private clearNow(contentId: string, authorId: string) {
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
