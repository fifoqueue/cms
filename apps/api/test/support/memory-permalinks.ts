import { invalidInput, Errors } from '#api/shared/errors';
import type { PermalinkSettings } from '@cms/sdk';
import { readPermalinkSettings } from '#api/domain/permalinks/content-path';
import type { PermalinkSubject } from '#api/domain/permalinks/content-path';
import {
  pathChanges,
  planPathChanges,
  regenerationEntry,
} from '#api/domain/permalinks/path-plan';
import type { PathChange, StoredPath } from '#api/domain/permalinks/path-plan';
import type { PermalinkRepository } from '#api/domain/permalinks/permalink-repository';

/**
 * Same contract as `PrismaPermalinkRepository`; `assign` and `remove` mirror `assignContentPath`
 * and the ON DELETE CASCADE. Plans are checked before any mutation, so failures change nothing.
 */
export class MemoryPermalinkRepository implements PermalinkRepository {
  readonly paths = new Map<string, StoredPath>();
  private stored: string | undefined;

  /** `sources` lists every content item, as the content table would. */
  constructor(private readonly sources: () => Iterable<PermalinkSubject>) {}

  async readSettings() {
    return readPermalinkSettings(
      this.stored === undefined ? undefined : JSON.parse(this.stored),
    );
  }

  async findByPath(path: string) {
    const row = this.paths.get(path);

    return row ? { contentId: row.contentId, current: row.current } : null;
  }

  async saveSettings(settings: PermalinkSettings) {
    const entries = this.withParents([...this.sources()]).map((source) =>
      regenerationEntry(source, this.current(source.id)),
    );

    this.apply(pathChanges(settings, entries));
    this.stored = JSON.stringify(settings);
  }

  /** Call before storing the content write, so a failure leaves the content unchanged. */
  async assign(subject: PermalinkSubject, retainPrevious: boolean) {
    const settings = await this.readSettings();
    const current = this.current(subject.id);
    const sources = [...this.sources()].filter(
      (source) => source.id !== subject.id,
    );
    sources.push(subject);
    const entries = this.withParents(sources)
      .filter(
        (source) =>
          source.id === subject.id ||
          (subject.type === 'page' && source.type === 'page'),
      )
      .map((source) => ({
        subject: source,
        current: this.current(source.id),
        retainPrevious:
          source.id === subject.id ? retainPrevious : !!source.publishedAt,
      }));
    const changes = pathChanges(settings, entries);

    this.apply(changes);

    return (
      changes.find((change) => change.contentId === subject.id)?.to ?? current!
    );
  }

  remove(contentId: string) {
    for (const [path, row] of this.paths)
      if (row.contentId === contentId) this.paths.delete(path);
  }

  current(contentId: string): string | null {
    for (const row of this.paths.values())
      if (row.current && row.contentId === contentId) return row.path;
    return null;
  }

  private withParents(sources: PermalinkSubject[]) {
    const byId = new Map(sources.map((source) => [source.id, source]));
    return sources.map((source) => {
      const parents: string[] = [];
      const seen = new Set([source.id]);
      for (let id = source.parentId; id;) {
        if (seen.has(id)) throw invalidInput(Errors.ContentParentInvalid);
        seen.add(id);
        const parent = byId.get(id);
        if (!parent) break;
        parents.unshift(parent.slug);
        id = parent.parentId;
      }
      return { ...source, parents };
    });
  }

  private apply(changes: PathChange[]) {
    const owners = new Map<string, StoredPath>();

    for (const { to } of changes) {
      const row = this.paths.get(to);

      if (row) owners.set(to, { ...row });
    }

    const plan = planPathChanges(changes, owners);

    for (const path of plan.release) this.paths.delete(path);
    for (const path of plan.demote) this.paths.get(path)!.current = false;
    for (const { path } of plan.promote) this.paths.get(path)!.current = true;
    for (const { path, contentId } of plan.insert)
      this.paths.set(path, { path, contentId, current: true });
  }
}
