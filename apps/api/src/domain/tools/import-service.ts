import { CONTENT_SLUG } from '@cms/sdk';
import type {
  ContentDocument,
  ContentInput,
  ContentStatus,
  WxrImportResult,
} from '@cms/sdk';
import type { Actor } from '#api/domain/auth/authorization';
import { authorize } from '#api/domain/auth/authorization';
import type { CommentRepository } from '#api/domain/comments/ports';
import type { ContentService } from '#api/domain/content/content-service';
import type { ContentTypeService } from '#api/domain/content/content-types';
import type { Clock, IdGenerator } from '#api/domain/ports';
import type { TaxonomyService } from '#api/domain/taxonomy/taxonomy-service';
import { fromWordPressHtml } from '#api/domain/tools/wxr';
import type { WxrComment, WxrParser, WxrTerm } from '#api/domain/tools/wxr';
import type { PatternService } from '#api/domain/content/pattern-service';
import type { UserDirectory } from '#api/domain/users/user-directory';
import { DomainError, Errors } from '#api/shared/errors';

/** Converts imported HTML to an editor document; a body the schema cannot hold throws `invalid_input`. */
export interface HtmlParser {
  parse(html: string): ContentDocument;
}

const STATUSES: Record<string, ContentStatus> = {
  publish: 'published',
  draft: 'draft',
  pending: 'pending',
  future: 'scheduled',
  private: 'private',
};

const COMMENT_STATUSES = {
  '1': 'approved',
  '0': 'pending',
  spam: 'spam',
  trash: 'trash',
} as const;

/** Parents before children, so every parent exists when a child is created. */
const parentsFirst = (terms: readonly WxrTerm[]) => {
  const bySlug = new Map(terms.map((term) => [term.slug, term]));
  const ordered: WxrTerm[] = [];
  const added = new Set<WxrTerm>();
  const visit = (term: WxrTerm, path: Set<string>) => {
    if (added.has(term) || path.has(term.slug)) return;
    path.add(term.slug);
    const parent = term.parent ? bySlug.get(term.parent) : undefined;
    if (parent) visit(parent, path);
    ordered.push(term);
    added.add(term);
  };
  for (const term of terms) visit(term, new Set());
  return ordered;
};

/**
 * Tools → Import: WordPress WXR files. Terms, entries and their comments are created through the
 * core services (so validation, permalinks and hooks apply); authors are matched by email, else
 * the importing administrator becomes the author. One failing entry never stops the rest.
 */
export class ImportService {
  constructor(
    private readonly deps: {
      parser: WxrParser;
      html: HtmlParser;
      content: Pick<ContentService, 'create'>;
      taxonomy: Pick<TaxonomyService, 'list' | 'create'>;
      types: Pick<ContentTypeService, 'list'>;
      comments: Pick<CommentRepository, 'insert'>;
      users: Pick<UserDirectory, 'list'>;
      ids: IdGenerator;
      clock: Clock;
      /** Imported `wp_block` items become patterns. */
      patterns?: Pick<PatternService, 'create'>;
    },
  ) {}

  async importWxr(xml: string, actor: Actor): Promise<WxrImportResult> {
    authorize(actor, 'tools.manage');
    const document = this.deps.parser.parse(xml);
    const result: WxrImportResult = {
      content: 0,
      categories: 0,
      tags: 0,
      comments: 0,
      skipped: [],
    };

    const categories = await this.terms(
      'category',
      document.categories,
      result,
    );
    const tags = await this.terms('tag', document.tags, result);
    const users = await this.deps.users.list();
    const authors = new Map(
      document.authors.flatMap((author) => {
        const user = users.find(
          (candidate) =>
            candidate.email.toLowerCase() === author.email.toLowerCase(),
        );
        return user ? [[author.login, user.id] as const] : [];
      }),
    );
    const types = new Set(
      (await this.deps.types.list()).map((type) => type.key),
    );

    // Patterns first, so entries can point at their new ids.
    const patterns = new Map<string, string>();
    for (const item of document.items) {
      if (item.type !== 'wp_block' || !this.deps.patterns) continue;
      const title = item.title.trim().slice(0, 191) || 'Pattern';
      try {
        const pattern = await this.deps.patterns.create(
          {
            title,
            document: this.deps.html.parse(
              fromWordPressHtml(item.html, patterns),
            ),
            synced: item.meta?.wp_pattern_sync_status !== 'unsynced',
            status: item.status === 'publish' ? 'published' : 'draft',
          },
          actor,
        );
        patterns.set(item.id, pattern.id);
      } catch (error) {
        if (!(error instanceof DomainError)) throw error;
        result.skipped.push({ title, reason: error.message });
      }
    }

    for (const item of document.items) {
      if (item.type === 'wp_block' && this.deps.patterns) continue;
      const status = STATUSES[item.status];
      if (!status || !types.has(item.type)) {
        result.skipped.push({
          title: item.title || item.slug,
          reason: Errors.ImportItemUnsupported(item.type, item.status),
        });
        continue;
      }
      // A planned date in the past publishes the entry instead.
      const scheduled =
        status === 'scheduled' &&
        !!item.publishedAt &&
        item.publishedAt > this.deps.clock.now();
      const title = item.title.trim() || item.slug || 'Untitled';
      let document: ContentInput['document'];
      try {
        document = this.deps.html.parse(fromWordPressHtml(item.html, patterns));
      } catch (error) {
        // A body the schema cannot hold skips that entry only (nothing is written for it).
        if (!(error instanceof DomainError)) throw error;
        result.skipped.push({ title, reason: error.message });
        continue;
      }
      const input: ContentInput = {
        type: item.type,
        title,
        ...(CONTENT_SLUG.test(item.slug) && { slug: item.slug.slice(0, 191) }),
        excerpt: item.excerpt.trim().slice(0, 1000),
        document,
        status: status === 'scheduled' && !scheduled ? 'published' : status,
        categoryIds: item.categories.flatMap(
          (slug) => categories.get(slug) ?? [],
        ),
        tagIds: item.tags.flatMap((slug) => tags.get(slug) ?? []),
        authorId: authors.get(item.author) ?? actor.id,
        ...(item.publishedAt && {
          publishedAt: item.publishedAt.toISOString(),
        }),
        sticky: item.sticky,
        allowComments: item.commentsOpen,
        ...(item.password && { password: item.password.slice(0, 200) }),
      };
      let id: string;
      try {
        id = (await this.deps.content.create(input, actor)).id;
      } catch (error) {
        if (!(error instanceof DomainError)) throw error;
        result.skipped.push({ title: input.title, reason: error.message });
        continue;
      }
      result.content += 1;
      result.comments += await this.comments(id, item.comments);
    }
    return result;
  }

  /** Creates missing terms; returns every imported slug's id. */
  private async terms(
    taxonomy: 'category' | 'tag',
    terms: readonly WxrTerm[],
    result: WxrImportResult,
  ) {
    const ids = new Map(
      (await this.deps.taxonomy.list(taxonomy)).map((term) => [
        term.slug,
        term.id,
      ]),
    );
    for (const term of parentsFirst(terms)) {
      if (ids.has(term.slug) || !CONTENT_SLUG.test(term.slug)) continue;
      try {
        const created = await this.deps.taxonomy.create(taxonomy, {
          name: term.name || term.slug,
          slug: term.slug,
          description: term.description.slice(0, 1000),
          parentId: (term.parent && ids.get(term.parent)) || null,
        });
        ids.set(created.slug, created.id);
        result[taxonomy === 'category' ? 'categories' : 'tags'] += 1;
      } catch (error) {
        if (!(error instanceof DomainError)) throw error;
        result.skipped.push({ title: term.name, reason: error.message });
      }
    }
    return ids;
  }

  /** Comments in thread order; pingbacks and trackbacks are left out. */
  private async comments(contentId: string, comments: readonly WxrComment[]) {
    const ids = new Map<string, string>();
    let count = 0;
    const ordered = [...comments].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
    );
    for (const comment of ordered) {
      const status =
        COMMENT_STATUSES[comment.approved as keyof typeof COMMENT_STATUSES];
      if (!status || (comment.type && comment.type !== 'comment')) continue;
      // Comments are plain text here; WordPress allows a little markup.
      const body = comment.body
        .replace(/<[^>]*>/g, '')
        .trim()
        .slice(0, 5000);
      if (!body) continue;
      const id = this.deps.ids.next();
      await this.deps.comments.insert({
        id,
        contentId,
        parentId: (comment.parentId && ids.get(comment.parentId)) || null,
        userId: null,
        authorName: (comment.authorName.trim() || 'Anonymous').slice(0, 100),
        authorEmail: comment.authorEmail.trim().toLowerCase().slice(0, 191),
        authorUrl: /^https?:\/\//i.test(comment.authorUrl)
          ? comment.authorUrl.slice(0, 255)
          : '',
        body,
        status,
        createdAt: comment.createdAt,
        updatedAt: comment.createdAt,
      });
      ids.set(comment.id, id);
      count += 1;
    }
    return count;
  }
}
