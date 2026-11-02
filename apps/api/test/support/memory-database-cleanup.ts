import type { DatabaseCleanupCounts, DatabaseTableSize } from '@cms/sdk';
import type { Actor } from '#api/domain/auth/authorization';
import type {
  CleanupCategory,
  CleanupPolicy,
  DatabaseCleanupStore,
} from '#api/domain/tools/database-cleanup';
import { invalidInput, Errors } from '#api/shared/errors';

type Row = { id: string; contentId?: string; createdAt: Date };

/** Expired rows are fixtures already classified as dead by their owning maintenance policy. */
export class MemoryDatabaseCleanupStore implements DatabaseCleanupStore {
  readonly rows: Record<CleanupCategory, Row[]> = {
    revisions: [],
    autosaves: [],
    trashedContent: [],
    spamComments: [],
    trashedComments: [],
    expired: [],
  };
  readonly sizes: DatabaseTableSize[] = [];
  readonly optimized: string[] = [];
  constructor(
    private readonly remove?: (
      category: CleanupCategory,
      id: string,
      actor: Actor,
    ) => Promise<void>,
  ) {}

  private candidates(category: CleanupCategory, policy: CleanupPolicy) {
    const rows = [...this.rows[category]];
    if (category === 'autosaves')
      return rows.filter((row) => row.createdAt < policy.autosavesBefore);
    if (category !== 'revisions') return rows;
    rows.sort(
      (a, b) =>
        b.createdAt.getTime() - a.createdAt.getTime() ||
        b.id.localeCompare(a.id),
    );
    const retained = new Map<string, number>();
    return rows.filter((row) => {
      const key = row.contentId!;
      const count = retained.get(key) ?? 0;
      retained.set(key, count + 1);
      return count >= policy.keepLatest;
    });
  }

  async counts(policy: CleanupPolicy): Promise<DatabaseCleanupCounts> {
    return {
      revisions: this.candidates('revisions', policy).length,
      autosaves: this.candidates('autosaves', policy).length,
      trashedContent: this.rows.trashedContent.length,
      spamComments: this.rows.spamComments.length,
      trashedComments: this.rows.trashedComments.length,
      expired: this.rows.expired.length,
      optimize: this.sizes.length,
    };
  }
  async tables() {
    return structuredClone(this.sizes);
  }
  async optimize(table: string) {
    if (!this.sizes.some((row) => row.table === table))
      throw invalidInput(Errors.InvalidInput);
    this.optimized.push(table);
  }
  async batch(
    category: CleanupCategory,
    policy: CleanupPolicy,
    actor: Actor,
    limit: number,
  ) {
    const selected = this.candidates(category, policy).slice(0, limit);
    for (const row of selected) {
      await this.remove?.(category, row.id, actor);
      this.rows[category].splice(this.rows[category].indexOf(row), 1);
    }
    return selected.length;
  }
}
