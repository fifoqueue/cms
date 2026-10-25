import { readable } from '#api/shared/stream';
import { platformWxrItemSchema } from '@cms/sdk/plugin';
import type { HookDispatcher } from '#api/domain/ports';
import type { ContentStatus } from '@cms/sdk';
import type { Actor } from '#api/domain/auth/authorization';
import { authorize } from '#api/domain/auth/authorization';
import { can } from '@cms/sdk/capabilities';
import type {
  CommentRecord,
  CommentRepository,
} from '#api/domain/comments/ports';
import type {
  ContentRecord,
  ContentRepository,
} from '#api/domain/content/content-repository';
import type { TaxonomyRepository } from '#api/domain/taxonomy/taxonomy-repository';
import {
  wxrComment,
  wxrFooter,
  wxrHeader,
  wxrItemEnd,
  wxrItemStart,
  wxrTermNames,
  toWordPressHtml,
} from '#api/domain/tools/wxr';
import type { WxrComment, WxrItem, WxrTerm } from '#api/domain/tools/wxr';
import type { UserDirectory } from '#api/domain/users/user-directory';

const STATUSES: Record<ContentStatus, string> = {
  published: 'publish',
  draft: 'draft',
  pending: 'pending',
  scheduled: 'future',
  private: 'private',
};

const APPROVED = { approved: '1', pending: '0', spam: 'spam', trash: 'trash' };
const PAGE = 100;

const toItem = (record: ContentRecord, origin: string): WxrItem => ({
  id: record.id,
  link: origin ? `${origin}${record.path}` : '',
  parentId: record.parentId ?? '',
  type: record.type,
  title: record.title,
  slug: record.slug,
  html: toWordPressHtml(record.html),
  excerpt: record.excerpt,
  status: STATUSES[record.status],
  publishedAt: record.publishedAt,
  author: record.authorSlug,
  password: '',
  sticky: record.sticky,
  commentsOpen: record.allowComments,
  categories: record.categories.map((term) => term.slug),
  tags: record.tags.map((term) => term.slug),
  comments: [],
});

/** A pattern as WordPress stores it: a `wp_block` post, unsynced ones marked in post meta. */
const patternItem = (pattern: {
  id: string;
  title: string;
  html: string;
  synced: boolean;
  status: string;
}): WxrItem => ({
  id: pattern.id,
  type: 'wp_block',
  title: pattern.title,
  slug: '',
  html: toWordPressHtml(pattern.html),
  excerpt: '',
  status: pattern.status === 'published' ? 'publish' : 'draft',
  publishedAt: null,
  author: '',
  password: '',
  sticky: false,
  commentsOpen: false,
  categories: [],
  tags: [],
  comments: [],
  meta: pattern.synced ? {} : { wp_pattern_sync_status: 'unsynced' },
});

/** IP address and user agent are moderator data: only exports by moderators carry them. */
const toComment = (comment: CommentRecord, moderator: boolean): WxrComment => ({
  id: comment.id,
  parentId: comment.parentId,
  authorName: comment.authorName,
  authorEmail: comment.authorEmail,
  authorUrl: comment.authorUrl,
  ...(moderator && {
    authorIp: comment.authorIp ?? '',
    authorUserAgent: comment.authorUserAgent ?? '',
  }),
  body: comment.body,
  approved: APPROVED[comment.status],
  type: 'comment',
  createdAt: comment.createdAt,
});

/** Streams every non-trashed entry and its comments as WordPress WXR 1.2. */
export class ExportService {
  constructor(
    private readonly deps: {
      content: Pick<ContentRepository, 'exportPage'>;
      hooks?: HookDispatcher;
      terms: Pick<TaxonomyRepository, 'list'>;
      comments: Pick<CommentRepository, 'exportPage'>;
      users: Pick<UserDirectory, 'list'>;
      site: () => Promise<{ title: string; siteUrl: string }>;
      /** Patterns, exported as WordPress `wp_block` items before the entries. */
      patterns?: () => Promise<
        {
          id: string;
          title: string;
          html: string;
          synced: boolean;
          status: string;
        }[]
      >;
    },
  ) {}

  async streamWxr(actor: Actor): Promise<ReadableStream<Uint8Array>> {
    authorize(actor, 'tools.manage');
    const [site, users, categories, tags] = await Promise.all([
      this.deps.site(),
      this.deps.users.list(),
      this.deps.terms.list('category', 'all'),
      this.deps.terms.list('tag', 'all'),
    ]);
    const slugOf = new Map(categories.map((term) => [term.id, term.slug]));
    const term = (record: (typeof categories)[number]): WxrTerm => ({
      slug: record.slug,
      name: record.name,
      description: record.description,
      parent: record.parentId ? (slugOf.get(record.parentId) ?? null) : null,
    });
    const header = {
      title: site.title,
      link: site.siteUrl,
      authors: users.map((user) => ({
        login: user.slug,
        email: user.email,
        displayName: user.name,
      })),
      categories: categories.map(term),
      tags: tags.map(term),
    };
    return readable(this.parts(header, can(actor, 'comments.moderate')));
  }

  /** Small callers and round-trip tests may still collect the stream as text. */
  async exportWxr(actor: Actor): Promise<string> {
    return new Response(await this.streamWxr(actor)).text();
  }

  private async *parts(
    header: Parameters<typeof wxrHeader>[0],
    moderator: boolean,
  ): AsyncGenerator<string> {
    const names = wxrTermNames(header);
    yield wxrHeader(header);
    for (const pattern of (await this.deps.patterns?.()) ?? [])
      yield wxrItemStart(patternItem(pattern), header, names) + wxrItemEnd;

    let afterContent: string | null = null;
    for (;;) {
      const records = await this.deps.content.exportPage(afterContent, PAGE);
      if (!records.length) break;
      for (const record of records) {
        yield wxrItemStart(toItem(record, header.link), header, names);
        let afterComment: string | null = null;
        for (;;) {
          const comments = await this.deps.comments.exportPage(
            record.id,
            afterComment,
            PAGE,
          );
          for (const comment of comments)
            yield wxrComment(toComment(comment, moderator));
          if (comments.length < PAGE) break;
          afterComment = comments.at(-1)!.id;
        }
        yield wxrItemEnd;
      }
      afterContent = records.at(-1)!.id;
    }
    const extras =
      (await this.deps.hooks?.applyFilter(
        'export.data',
        [],
        (value) =>
          platformWxrItemSchema.array().max(10_000).safeParse(value).success &&
          new TextEncoder().encode(JSON.stringify(value)).byteLength <=
            16 * 1024 * 1024,
      )) ?? [];
    for (const item of platformWxrItemSchema.array().parse(extras)) {
      yield wxrItemStart(item, header, names);
      for (const { authorIp, authorUserAgent, ...comment } of item.comments)
        yield wxrComment(
          moderator ? { ...comment, authorIp, authorUserAgent } : comment,
        );
      yield wxrItemEnd;
    }
    yield wxrFooter;
    void this.deps.hooks?.emit('export.generated', { format: 'wxr' });
  }
}
