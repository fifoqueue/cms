import {
  CONTENT_SLUG,
  canonicalPermalinkPath,
  wxrImportOptionsSchema,
} from '@cms/sdk';
import type {
  ContentDocument,
  ContentInput,
  ContentStatus,
  ImportAuthorMode,
  MenuItem,
  WxrImportResult,
} from '@cms/sdk';
import type { MenuService } from '#api/domain/appearance/menu-service';
import type { RedirectWriter } from '#api/domain/permalinks/permalink-repository';
import { classicHtml } from '#api/domain/tools/classic-content';
import { importMedia, rewriteMedia } from '#api/domain/tools/import-media';
import type { ImportMediaDeps } from '#api/domain/tools/import-media';
import type { AdminMedia } from '@cms/sdk';
import type { ClassicAttachments } from '#api/domain/tools/classic-content';
import type { UserService } from '#api/domain/users/user-service';
import { parseInput } from '#api/shared/validation';
import type { Actor } from '#api/domain/auth/authorization';
import { authorize } from '#api/domain/auth/authorization';
import type { CommentRepository } from '#api/domain/comments/ports';
import type { ContentService } from '#api/domain/content/content-service';
import type { ContentTypeService } from '#api/domain/content/content-types';
import type { Clock, HookDispatcher, IdGenerator } from '#api/domain/ports';
import { platformImportItemSchema } from '@cms/sdk/plugin';
import { canonicalAddress } from '#api/shared/ip-address';
import { cleanUserAgent } from '#api/shared/user-agent';
import type { TaxonomyService } from '#api/domain/taxonomy/taxonomy-service';
import { fromWordPressHtml } from '#api/domain/tools/wxr';
import type { PatternService } from '#api/domain/content/pattern-service';
import type {
  WxrAuthor,
  WxrComment,
  WxrDocument,
  WxrItem,
  WxrParser,
  WxrTerm,
} from '#api/domain/tools/wxr';
import type { UserDirectory } from '#api/domain/users/user-directory';
import {
  DomainError,
  invalidInput,
  issueParams,
  paramsOf,
  Errors,
} from '#api/shared/errors';

/** Converts imported HTML to an editor document; a body the schema cannot hold throws `invalid_input`. */
export interface HtmlParser {
  parse(html: string): ContentDocument;
}

/** A skipped item for a refusal, keeping the values its catalog message leaves out. */
const skip = (title: string, error: DomainError) => {
  const params = paramsOf(error);
  return { title, reason: error.message, ...(params && { params }) };
};

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

/** Entries before the entries that name them as parent (`wp:post_parent`), cycles broken. */
const entriesParentsFirst = (items: readonly WxrItem[]) => {
  const byId = new Map(items.map((item) => [item.id, item]));
  const ordered: WxrItem[] = [];
  const added = new Set<WxrItem>();
  const visit = (item: WxrItem, path: Set<WxrItem>) => {
    if (added.has(item) || path.has(item)) return;
    path.add(item);
    const parent = item.parentId ? byId.get(item.parentId) : undefined;
    if (parent) visit(parent, path);
    ordered.push(item);
    added.add(item);
  };
  for (const item of items) visit(item, new Set());
  return ordered;
};

const IMAGE_FILE = /\.(?:jpe?g|png|gif|webp|avif)(?:\?|$)/i;

/** The old site's origin, so only its own addresses become redirects. */
const originOf = (url: string | undefined) => {
  try {
    return url ? new URL(url).origin : null;
  } catch {
    return null;
  }
};

/** An entry's old path on the old site, canonical and without a final slash; null otherwise. */
const oldPath = (link: string | undefined, origin: string | null) => {
  if (!link || !origin) return null;
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return null;
  }
  // Query-string addresses (`/?p=12`) cannot be content paths.
  if (url.origin !== origin || url.search) return null;
  const path = canonicalPermalinkPath(url.pathname)?.replace(/(.)\/$/, '$1');
  return path && path !== '/' ? path : null;
};

const withoutSlash = (path: string) => path.replace(/(.)\/$/, '$1');

/** Menu links WordPress stores as custom URLs; `#` placeholders are not links. */
const menuLink = (url: string | undefined) =>
  url &&
  ((url.startsWith('/') && !url.startsWith('//')) ||
    /^https?:\/\/[^\s]+$/.test(url) ||
    /^mailto:[^\s]+$/.test(url))
    ? url.slice(0, 2048)
    : null;

/**
 * Tools → Import: WordPress WXR files, like the WordPress importer. Terms, entries, comments and
 * menus are created through the core services (so validation, permalinks and hooks apply).
 * Original slugs are kept, old same-site addresses redirect to the new ones, page parents are
 * kept, and classic-editor shortcodes become content blocks. Authors match users by email or
 * login; the others go to the importing administrator or get new accounts. Attachments are not
 * downloaded: their addresses stay referenced and are listed for upload. One failing entry
 * never stops the rest.
 */
export class ImportService {
  constructor(
    private readonly deps: {
      parser: WxrParser;
      attachments?: ImportMediaDeps;
      hooks?: HookDispatcher;
      html: HtmlParser;
      content: Pick<ContentService, 'create'>;
      taxonomy: Pick<TaxonomyService, 'list' | 'create'>;
      types: Pick<ContentTypeService, 'list'>;
      comments: Pick<CommentRepository, 'insert'>;
      users: Pick<UserDirectory, 'list'>;
      ids: IdGenerator;
      clock: Clock;
      /** Imported `wp_block` items become patterns. */
      patterns?: Pick<PatternService, 'create' | 'update' | 'remove'>;
      /** Old addresses of imported entries. */
      redirects?: RedirectWriter;
      menus?: Pick<MenuService, 'get' | 'update'>;
      /** Accounts for the file's authors, with a random password they reset. */
      accounts?: Pick<UserService, 'create'>;
      tokens?: { issue(): string };
    },
  ) {}

  async importWxr(
    xml: string,
    actor: Actor,
    options: unknown = {},
  ): Promise<WxrImportResult> {
    authorize(actor, 'tools.manage');
    const { authors: mode, downloadAttachments } = parseInput(
      wxrImportOptionsSchema,
      options,
    );
    const document = this.deps.parser.parse(xml);
    // Filters get password-free items; the file's password is re-applied afterwards.
    if (this.deps.hooks)
      document.items = await Promise.all(
        document.items.map(async ({ password, ...item }) => ({
          ...platformImportItemSchema.parse(
            await this.deps.hooks!.applyFilter(
              'import.item',
              item,
              (value) => platformImportItemSchema.safeParse(value).success,
            ),
          ),
          password,
        })),
      );
    const result: WxrImportResult = {
      content: 0,
      categories: 0,
      tags: 0,
      comments: 0,
      users: 0,
      menus: 0,
      redirects: 0,
      skipped: [],
      attachments: [],
    };

    const types = new Set(
      (await this.deps.types.list()).map((type) => type.key),
    );
    const referenced = new Set(
      document.items
        .filter((item) => types.has(item.type) && !!STATUSES[item.status])
        .map((item) => item.author.trim().toLowerCase()),
    );
    const authors = await this.authors(
      document.authors.filter((author) =>
        referenced.has(author.login.trim().toLowerCase()),
      ),
      mode,
      actor,
      result,
    );
    const categories = await this.terms(
      'category',
      document.categories,
      result,
    );
    const tags = await this.terms('tag', document.tags, result);
    const attachments = new Map(
      document.items
        .filter((item) => item.type === 'attachment' && item.attachmentUrl)
        .map((item) => [item.id, item]),
    );
    const library: ClassicAttachments = {
      url: (id) => attachments.get(id)?.attachmentUrl,
      childImages: (parentId) =>
        [...attachments.values()]
          .filter(
            (item) =>
              item.parentId === parentId &&
              IMAGE_FILE.test(item.attachmentUrl ?? ''),
          )
          .map((item) => item.attachmentUrl!),
    };
    const uploaded = new Map<string, AdminMedia>();
    const sources = new Map<string, AdminMedia>();
    if (downloadAttachments) {
      if (!this.deps.attachments) throw invalidInput(Errors.MediaUploadRefused);
      const budget = { remaining: 100 };
      for (const item of attachments.values()) {
        try {
          const media =
            sources.get(item.attachmentUrl!) ??
            (await importMedia(item, actor, this.deps.attachments, budget));
          uploaded.set(item.id, media);
          sources.set(item.attachmentUrl!, media);
        } catch (error) {
          const title = item.title || item.attachmentUrl!;
          result.skipped.push(
            error instanceof DomainError
              ? skip(title, error)
              : { title, reason: Errors.MediaUploadRefused },
          );
        }
      }
    }
    const origin = originOf(document.baseUrl);
    const created = new Map<string, string>();
    const featured = new Map<string, number>();

    // Stage every id before parsing bodies, so forward and cyclic references keep their targets.
    const patterns = new Map<string, string>();
    const staged: { item: WxrItem; id: string; title: string }[] = [];
    if (this.deps.patterns) {
      const pending = new Set<string>();
      try {
        for (const item of document.items) {
          if (item.type !== 'wp_block') continue;
          const title = item.title.trim().slice(0, 191) || 'Pattern';
          try {
            const pattern = await this.deps.patterns.create(
              {
                title,
                document: { type: 'doc', content: [{ type: 'paragraph' }] },
                synced: item.meta?.wp_pattern_sync_status !== 'unsynced',
                status: 'draft',
              },
              actor,
            );
            patterns.set(item.id, pattern.id);
            staged.push({ item, id: pattern.id, title });
            pending.add(pattern.id);
          } catch (error) {
            if (!(error instanceof DomainError)) throw error;
            result.skipped.push(skip(title, error));
          }
        }
        for (const { item, id, title } of staged) {
          try {
            await this.deps.patterns.update(
              id,
              {
                title,
                document: rewriteMedia(
                  this.deps.html.parse(
                    classicHtml(
                      fromWordPressHtml(item.html, patterns),
                      item.id,
                      library,
                    ),
                  ),
                  sources,
                ),
                synced: item.meta?.wp_pattern_sync_status !== 'unsynced',
                status: item.status === 'publish' ? 'published' : 'draft',
              },
              actor,
            );
            pending.delete(id);
          } catch (error) {
            // A failed body must not leave a successful-looking empty pattern behind.
            await this.deps.patterns.remove(id, actor);
            pending.delete(id);
            patterns.delete(item.id);
            if (!(error instanceof DomainError)) throw error;
            result.skipped.push(skip(title, error));
          }
        }
      } finally {
        for (const id of pending) await this.deps.patterns.remove(id, actor);
      }
    }

    for (const item of entriesParentsFirst(
      document.items.filter(
        // Attachments without a file and unknown types are reported as skipped.
        (item) =>
          !attachments.has(item.id) &&
          item.type !== 'nav_menu_item' &&
          !(item.type === 'wp_block' && this.deps.patterns),
      ),
    )) {
      const status = STATUSES[item.status];
      if (!status || !types.has(item.type)) {
        result.skipped.push({
          title: item.title || item.slug,
          reason: Errors.ImportItemUnsupported,
          // Both come from the file: bounded like every other params.
          params: issueParams({ type: item.type, status: item.status }),
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
        document = this.deps.html.parse(
          classicHtml(fromWordPressHtml(item.html, patterns), item.id, library),
        );
      } catch (error) {
        // A body the schema cannot hold skips that entry only (nothing is written for it).
        if (!(error instanceof DomainError)) throw error;
        result.skipped.push(skip(title, error));
        continue;
      }
      const parentId =
        item.type === 'page' && item.parentId
          ? created.get(item.parentId)
          : undefined;
      const input: ContentInput = {
        type: item.type,
        title,
        ...(CONTENT_SLUG.test(item.slug) && { slug: item.slug.slice(0, 191) }),
        excerpt: item.excerpt.trim().slice(0, 1000),
        document: rewriteMedia(document, sources),
        featuredMediaId: uploaded.get(item.meta?._thumbnail_id ?? '')?.id,
        status: status === 'scheduled' && !scheduled ? 'published' : status,
        categoryIds: item.categories.flatMap(
          (slug) => categories.get(slug) ?? [],
        ),
        tagIds: item.tags.flatMap((slug) => tags.get(slug) ?? []),
        authorId: authors.get(item.author.trim().toLowerCase()) ?? actor.id,
        ...(parentId && { parentId }),
        ...(item.publishedAt && {
          publishedAt: item.publishedAt.toISOString(),
        }),
        sticky: item.sticky,
        allowComments: item.commentsOpen,
        ...(item.password && { password: item.password.slice(0, 200) }),
      };
      let entry: { id: string; path: string };
      try {
        entry = await this.deps.content.create(input, actor);
      } catch (error) {
        if (!(error instanceof DomainError)) throw error;
        result.skipped.push(skip(input.title, error));
        continue;
      }
      created.set(item.id, entry.id);
      result.content += 1;
      result.comments += await this.comments(entry.id, item.comments);
      const previous = oldPath(item.link, origin);
      if (
        previous &&
        previous !== withoutSlash(entry.path) &&
        (await this.deps.redirects?.addRedirect(entry.id, previous))
      )
        result.redirects += 1;
      const thumbnail = item.meta?._thumbnail_id;
      if (thumbnail && attachments.has(thumbnail))
        featured.set(thumbnail, (featured.get(thumbnail) ?? 0) + 1);
    }

    result.attachments = [...attachments.values()].map((item) => ({
      url: uploaded.get(item.id)?.url ?? item.attachmentUrl!,
      title: item.title,
      featured: featured.get(item.id) ?? 0,
    }));
    await this.menus(document, created, { categories, tags }, actor, result);
    void this.deps.hooks?.emit('import.completed', result);
    return result;
  }

  /** Users for the file's author logins: matched by email or login, else per `mode`. */
  private async authors(
    authors: readonly WxrAuthor[],
    mode: ImportAuthorMode,
    actor: Actor,
    result: WxrImportResult,
  ) {
    const users = await this.deps.users.list();
    const ids = new Map<string, string>();
    const byEmail = new Map(
      users.map((user) => [user.email.toLowerCase(), user.id]),
    );
    const byLogin = new Map(
      users.map((user) => [user.slug.toLowerCase(), user.id]),
    );
    const unique = [
      ...new Map(
        authors.map((author) => [author.login.trim().toLowerCase(), author]),
      ).values(),
    ];
    const missing = new Set(
      unique
        .filter((author) => {
          const email = author.email.trim().toLowerCase();
          const login = author.login.trim().toLowerCase();
          return email && !byEmail.has(email) && !byLogin.has(login);
        })
        .map((author) => author.email.trim().toLowerCase()),
    );
    // Reject the whole request before account creation or any term/content side effects.
    if (
      mode !== 'me' &&
      this.deps.accounts &&
      this.deps.tokens &&
      missing.size > 100
    )
      throw invalidInput(Errors.ImportAuthorsLimit);
    for (const author of unique) {
      const email = author.email.trim().toLowerCase();
      const login = author.login.trim().toLowerCase();
      const id = byEmail.get(email) ?? byLogin.get(login);
      if (id) {
        ids.set(login, id);
        continue;
      }
      if (mode === 'me' || !email || !this.deps.accounts || !this.deps.tokens)
        continue;
      const name = (author.displayName.trim() || author.login).slice(0, 100);
      try {
        const account = await this.deps.accounts.create(
          {
            name,
            email,
            role: mode,
            ...(CONTENT_SLUG.test(login) && { slug: login }),
            password: this.deps.tokens.issue(),
          },
          actor,
        );
        ids.set(login, account.id);
        byEmail.set(email, account.id);
        byLogin.set(login, account.id);
        result.users += 1;
      } catch (error) {
        if (!(error instanceof DomainError)) throw error;
        result.skipped.push(skip(name, error));
      }
    }
    return ids;
  }

  /**
   * WordPress navigation menus (`nav_menu_item` entries) as core menus, in menu order and up to
   * three levels. Items whose target was not imported are left out with their children moved
   * up. The first imported menu takes the primary location when it is free; WXR files do not
   * carry theme locations.
   */
  private async menus(
    document: WxrDocument,
    created: ReadonlyMap<string, string>,
    terms: Record<'categories' | 'tags', ReadonlyMap<string, string>>,
    actor: Actor,
    result: WxrImportResult,
  ) {
    const entries = document.items.filter(
      (item) => item.type === 'nav_menu_item' && item.menus?.length,
    );
    if (!entries.length || !this.deps.menus) return;
    const termOf = new Map<
      string,
      { taxonomy: 'category' | 'tag'; id: string }
    >();
    for (const term of document.categories) {
      const id = terms.categories.get(term.slug);
      if (term.id && id) termOf.set(term.id, { taxonomy: 'category', id });
    }
    for (const term of document.tags) {
      const id = terms.tags.get(term.slug);
      if (term.id && id) termOf.set(term.id, { taxonomy: 'tag', id });
    }
    const grouped = new Map<string, { name: string; items: WxrItem[] }>();
    for (const entry of entries) {
      const menu = entry.menus![0]!;
      const group = grouped.get(menu.slug) ?? { name: menu.name, items: [] };
      group.items.push(entry);
      grouped.set(menu.slug, group);
    }

    const target = (
      item: WxrItem,
    ): Omit<MenuItem, 'id' | 'children'> | null => {
      const meta = item.meta ?? {};
      const base = {
        label: item.title.trim().slice(0, 191),
        newTab: meta._menu_item_target === '_blank',
      };
      const objectId = meta._menu_item_object_id ?? '';
      if (meta._menu_item_type === 'post_type') {
        const contentId = created.get(objectId);
        return contentId ? { ...base, kind: 'content', contentId } : null;
      }
      if (meta._menu_item_type === 'taxonomy') {
        const term = termOf.get(objectId);
        return term
          ? { ...base, kind: 'term', taxonomy: term.taxonomy, termId: term.id }
          : null;
      }
      const url = menuLink(meta._menu_item_url);
      return url ? { ...base, kind: 'custom', url } : null;
    };

    let settings;
    try {
      settings = await this.deps.menus.get(actor);
    } catch (error) {
      if (!(error instanceof DomainError)) throw error;
      result.skipped.push(skip('Menus', error));
      return;
    }
    const added: string[] = [];
    for (const { name, items } of grouped.values()) {
      const nodes = new Map<string, MenuItem>();
      const depth = new Map<string, number>();
      const roots: MenuItem[] = [];
      const wpParent = new Map(
        items.map((item) => [item.id, item.meta?._menu_item_menu_item_parent]),
      );
      /** The nearest kept ancestor (skipped items pass their children up). */
      const keptParent = (id: string | undefined) => {
        const seen = new Set<string>();
        while (id && id !== '0' && !seen.has(id)) {
          seen.add(id);
          if (nodes.has(id)) return id;
          id = wpParent.get(id);
        }
        return null;
      };
      for (const item of entriesParentsFirst(
        [...items]
          .map((entry) => ({ ...entry, parentId: wpParent.get(entry.id) }))
          .sort((a, b) => (a.menuOrder ?? 0) - (b.menuOrder ?? 0)),
      )) {
        const link = target(item);
        if (!link) continue;
        const node: MenuItem = {
          ...link,
          id: this.deps.ids.next(),
          children: [],
        };
        let parent = keptParent(wpParent.get(item.id));
        // Deeper levels join the third level.
        while (parent && (depth.get(parent) ?? 1) >= 3)
          parent = keptParent(wpParent.get(parent));
        if (parent) {
          nodes.get(parent)!.children.push(node);
          depth.set(item.id, (depth.get(parent) ?? 1) + 1);
        } else {
          roots.push(node);
          depth.set(item.id, 1);
        }
        nodes.set(item.id, node);
      }
      if (!roots.length) continue;
      const id = this.deps.ids.next();
      settings.menus.push({
        id,
        name: (name.trim() || 'Menu').slice(0, 100),
        items: roots.slice(0, 200),
      });
      added.push(id);
    }
    if (!added.length) return;
    if (!settings.locations.primary) settings.locations.primary = added[0]!;
    try {
      await this.deps.menus.update(settings, actor);
      result.menus += added.length;
    } catch (error) {
      if (!(error instanceof DomainError)) throw error;
      result.skipped.push(skip('Menus', error));
    }
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
        result.skipped.push(skip(term.name, error));
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
        // Invalid addresses are dropped; valid ones stored in canonical form.
        authorIp: canonicalAddress((comment.authorIp ?? '').trim()),
        authorUserAgent: cleanUserAgent(comment.authorUserAgent ?? ''),
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
