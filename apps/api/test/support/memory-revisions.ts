import type {
  RevisionRecord,
  RevisionRepository,
  RevisionWrite,
  RevisionDeleteGuard,
  RevisionSave,
} from '#api/domain/content/revisions';
import type { ContentRecord } from '#api/domain/content/content-repository';
import { checkDeleteGuard } from '#api/infra/prisma/revision-delete-guard';
import { invalidInput, notFound, Errors } from '#api/shared/errors';

/** The content store whose write queue autosaves share (the Prisma adapter's content lock). */
export interface MemoryContentWrites {
  exclusive<T>(task: () => Promise<T>): Promise<T>;
  savedAt(contentId: string): Date | undefined;
  snapshot(contentId: string): RevisionDeleteGuard | undefined;
}

/** Same contract as `PrismaRevisionRepository`. Built by `MemoryContentRepository`. */
export class MemoryRevisionRepository implements RevisionRepository {
  readonly rows: RevisionRecord[] = [];

  constructor(private readonly content: MemoryContentWrites) {}

  /** Called by the content transaction; never takes the write queue a second time. */
  save(record: ContentRecord, revision: RevisionSave) {
    if (record.textSavedAt.getTime() === record.updatedAt.getTime()) {
      this.rows.push({
        id: revision.id,
        contentId: record.id,
        authorId: revision.authorId,
        ip: revision.ip ?? null,
        userAgent: revision.userAgent ?? null,
        authorName: revision.authorId,
        kind: 'revision',
        title: record.title,
        excerpt: record.excerpt,
        document: structuredClone(record.document),
        createdAt: record.textSavedAt,
      });
      const own = this.newestFirst(record.id).filter(
        (row) => row.kind === 'revision',
      );
      for (const stale of own.slice(revision.keep))
        this.rows.splice(this.rows.indexOf(stale), 1);
    }
    if (revision.clearAutosave)
      this.clearNow(record.id, revision.authorId, record.updatedAt);
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

  delete(contentId: string, id: string, guard: RevisionDeleteGuard) {
    return this.content.exclusive(async () => {
      const current = this.content.snapshot(contentId);
      checkDeleteGuard(current, guard);
      const revision = this.rows.find(
        (row) => row.id === id && row.contentId === contentId,
      );
      if (!revision) throw notFound(Errors.RevisionNotFound);
      if (revision.kind !== 'revision')
        throw invalidInput(Errors.RevisionAutosaveDelete);
      this.rows.splice(this.rows.indexOf(revision), 1);
    });
  }

  /** The user's autosave newer than the durable text-save watermark. */
  pendingNow(contentId: string, authorId: string, savedAt: Date) {
    const rows = this.newestFirst(contentId);
    const autosave = rows.find(
      (row) => row.kind === 'autosave' && row.authorId === authorId,
    );
    return autosave && autosave.createdAt > savedAt ? autosave : null;
  }

  async pendingAutosave(contentId: string, authorId: string, savedAt: Date) {
    return structuredClone(this.pendingNow(contentId, authorId, savedAt));
  }

  private clearNow(contentId: string, authorId: string, savedAt?: Date) {
    for (const row of [...this.rows])
      if (
        row.contentId === contentId &&
        row.authorId === authorId &&
        row.kind === 'autosave' &&
        (!savedAt || row.createdAt <= savedAt)
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
