import { autosaveInputSchema } from '@cms/sdk';
import type {
  ContentInput,
  ContentRevision,
  ContentRevisionSummary,
  ContentEntry,
} from '@cms/sdk';
import type { Actor } from '#api/domain/auth/authorization';
import type { ContentService } from '#api/domain/content/content-service';
import type { DocumentRenderer } from '#api/domain/content/content-repository';
import type {
  RevisionRecord,
  RevisionRepository,
} from '#api/domain/content/revisions';
import type { Clock, IdGenerator } from '#api/domain/ports';
import { notFound, Errors } from '#api/shared/errors';
import { parseInput } from '#api/shared/validation';

const toSummary = (
  revision: Omit<RevisionRecord, 'document' | 'excerpt'>,
): ContentRevisionSummary => ({
  id: revision.id,
  kind: revision.kind,
  authorName: revision.authorName,
  createdAt: revision.createdAt.toISOString(),
  title: revision.title,
});

const toRevision = (revision: RevisionRecord): ContentRevision => ({
  ...toSummary(revision),
  excerpt: revision.excerpt,
  document: revision.document,
});

/** Every input field of an entry as stored, so a restore changes only the text. */
export const inputOf = (entry: ContentEntry): ContentInput => ({
  type: entry.type,
  title: entry.title,
  slug: entry.slug,
  excerpt: entry.excerpt,
  document: entry.document,
  status: entry.status,
  parentId: entry.parentId,
  extraTermIds: entry.extraTerms.map((term) => term.id),
  categoryIds: entry.categories.map((term) => term.id),
  tagIds: entry.tags.map((term) => term.id),
  seo: entry.seo,
  authorId: entry.authorId,
  publishedAt: entry.publishedAt ?? undefined,
  sticky: entry.sticky,
  allowComments: entry.allowComments,
  featuredMediaId: entry.featuredMediaId,
});

/** Revisions and autosaves of entries, readable by whoever may edit the entry. */
export class RevisionService {
  constructor(
    private readonly deps: {
      content: ContentService;
      revisions: RevisionRepository;
      renderer: DocumentRenderer;
      ids: IdGenerator;
      clock: Clock;
    },
  ) {}

  async list(
    contentId: string,
    actor: Actor,
  ): Promise<ContentRevisionSummary[]> {
    await this.editable(contentId, actor);
    return (await this.deps.revisions.list(contentId)).map(toSummary);
  }

  async get(
    contentId: string,
    id: string,
    actor: Actor,
  ): Promise<ContentRevision> {
    await this.editable(contentId, actor);
    return toRevision(await this.require(contentId, id));
  }

  /** Copies a revision's text into the entry; everything else stays as it is. */
  async restore(
    contentId: string,
    id: string,
    actor: Actor,
  ): Promise<ContentEntry> {
    const entry = await this.deps.content.get(contentId, actor);
    const revision = await this.require(contentId, id);
    return this.deps.content.update(
      contentId,
      {
        ...inputOf(entry),
        title: revision.title,
        excerpt: revision.excerpt,
        document: revision.document,
      },
      actor,
    );
  }

  /** Keeps the actor's unsaved text; the next save of the entry discards it. */
  async autosave(contentId: string, input: unknown, actor: Actor) {
    await this.editable(contentId, actor);
    const data = parseInput(autosaveInputSchema, input);
    // Rejects documents outside the editor schema, like a save would.
    this.deps.renderer.render(data.document);
    await this.deps.revisions.autosave({
      id: this.deps.ids.next(),
      contentId,
      authorId: actor.id,
      kind: 'autosave',
      title: data.title,
      excerpt: data.excerpt,
      document: data.document,
      createdAt: this.deps.clock.now(),
    });
  }

  /** The actor's autosave when it is newer than the saved entry. */
  async pendingAutosave(
    contentId: string,
    actor: Actor,
  ): Promise<ContentRevision | null> {
    const record = await this.editable(contentId, actor);
    const autosave = await this.deps.revisions.findAutosave(
      contentId,
      actor.id,
    );
    return autosave && autosave.createdAt > record.updatedAt
      ? toRevision(autosave)
      : null;
  }

  private async editable(contentId: string, actor: Actor) {
    const record = await this.deps.content.require(contentId);
    this.deps.content.assertEditable(actor, record);
    return record;
  }

  private async require(contentId: string, id: string) {
    const revision = await this.deps.revisions.get(id);
    if (!revision || revision.contentId !== contentId)
      throw notFound(Errors.RevisionNotFound);
    return revision;
  }
}
