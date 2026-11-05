import { invalidInput, Errors } from '#api/shared/errors';
import type { PermalinkSettings } from '@cms/sdk';
import { readPermalinkSettings } from '#api/domain/permalinks/content-path';
import type { PermalinkSubject } from '#api/domain/permalinks/content-path';
import {
  resolvePathChanges,
  planPathChanges,
  regenerationEntry,
} from '#api/domain/permalinks/path-plan';
import type { PathChange, StoredPath } from '#api/domain/permalinks/path-plan';
import type {
  PermalinkRepository,
  RedirectWriter,
} from '#api/domain/permalinks/permalink-repository';
import { permalinkPathIssue } from '@cms/sdk';

type PublicationSubject = PermalinkSubject & { status?: string };
type PublishedPath = StoredPath & { wasPublic?: boolean };

/**
 * Same contract as `PrismaPermalinkRepository`; `assign` and `remove` mirror `assignContentPath`
 * and the ON DELETE CASCADE. Plans are checked before any mutation, so failures change nothing.
 */
export class MemoryPermalinkRepository
  implements PermalinkRepository, RedirectWriter
{
  readonly paths = new Map<string, PublishedPath>();
  readonly deleted = new Set<string>();
  private stored: string | undefined;

  /** `sources` lists every content item, as the content table would. */
  constructor(
    private readonly sources: () => Iterable<PublicationSubject>,
    private readonly isTrashed: (id: string) => boolean = () => false,
  ) {}

  private owner(row: PublishedPath) {
    return {
      contentId: row.contentId,
      current: row.current,
      ...(row.wasPublic && this.isTrashed(row.contentId) ? { gone: true } : {}),
    };
  }

  async readSettings() {
    return readPermalinkSettings(
      this.stored === undefined ? undefined : JSON.parse(this.stored),
    );
  }

  async findByPath(path: string) {
    const row = this.paths.get(path);

    return row ? this.owner(row) : null;
  }

  async findCaseInsensitive(path: string) {
    const rows = [...this.paths.values()].filter(
      (row) => row.path.toLowerCase() === path.toLowerCase(),
    );

    return rows.length === 1 ? this.owner(rows[0]!) : null;
  }

  async addRedirect(contentId: string, path: string) {
    if (permalinkPathIssue(path) || this.paths.has(path)) return false;
    this.paths.set(path, { path, contentId, current: false });
    this.publish([contentId]);

    return true;
  }

  async saveSettings(settings: PermalinkSettings) {
    const entries = this.withParents([...this.sources()]).map((source) =>
      regenerationEntry(source, this.current(source.id)),
    );

    this.apply(await resolvePathChanges(settings, entries));
    this.publish([...this.sources()].map((source) => source.id));
    this.stored = JSON.stringify(settings);
  }

  /** Call before storing the content write, so a failure leaves the content unchanged. */
  async assign(subject: PublicationSubject, retainPrevious: boolean) {
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
    const changes = await resolvePathChanges(settings, entries);

    this.apply(changes);
    this.publish(
      sources.map((source) => source.id),
      sources,
    );

    return (
      changes.find((change) => change.contentId === subject.id)?.to ?? current!
    );
  }

  remove(contentId: string) {
    for (const [path, row] of this.paths)
      if (row.contentId === contentId) {
        if (row.wasPublic) this.deleted.add(path);
        this.paths.delete(path);
      }
  }

  async wasDeleted(path: string) {
    return this.deleted.has(path);
  }

  publish(ids: readonly string[], sources = [...this.sources()]) {
    const publicIds = new Set(
      sources
        .filter(
          (source) =>
            ids.includes(source.id) &&
            source.status === 'published' &&
            !this.isTrashed(source.id),
        )
        .map((source) => source.id),
    );

    for (const row of this.paths.values())
      if (publicIds.has(row.contentId)) row.wasPublic = true;
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
