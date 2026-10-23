import { XMLParser } from 'fast-xml-parser';
import type {
  WxrComment,
  WxrDocument,
  WxrItem,
  WxrParser,
  WxrTerm,
} from '#api/domain/tools/wxr';
import { invalidInput, Errors } from '#api/shared/errors';

type Node = Record<string, unknown>;

const ARRAYS = new Set([
  'rss.channel.item',
  'rss.channel.wp:author',
  'rss.channel.wp:category',
  'rss.channel.wp:tag',
  'rss.channel.item.category',
  'rss.channel.item.wp:comment',
]);

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: false,
  parseAttributeValue: false,
  jPath: true,
  isArray: (_name, path) => ARRAYS.has(String(path)),
});

const MAX_ITEMS = 10_000;
const MAX_TERMS = 20_000;
const MAX_COMMENTS = 100_000;

/** Text content of a parsed value (plain text, CDATA or an element with attributes). */
const str = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean')
    return String(value);
  if (value && typeof value === 'object' && '#text' in value)
    return str((value as Node)['#text']);
  return '';
};

const list = (value: unknown): Node[] =>
  Array.isArray(value) ? (value as Node[]) : [];

/** WordPress SQL dates (`YYYY-MM-DD HH:MM:SS`), read as UTC; zero dates are none. */
const date = (value: unknown): Date | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(
    str(value).trim(),
  );
  if (!match || match[1] === '0000') return null;
  const [, year, month, day, hours, minutes, seconds] = match.map(Number);
  const parsed = new Date(
    Date.UTC(year!, month! - 1, day!, hours!, minutes!, seconds!),
  );
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const comment = (node: Node): WxrComment => ({
  id: str(node['wp:comment_id']),
  parentId: str(node['wp:comment_parent']) || null,
  authorName: str(node['wp:comment_author']),
  authorEmail: str(node['wp:comment_author_email']),
  authorUrl: str(node['wp:comment_author_url']),
  body: str(node['wp:comment_content']),
  approved: str(node['wp:comment_approved']),
  type: str(node['wp:comment_type']),
  createdAt:
    date(node['wp:comment_date_gmt']) ??
    date(node['wp:comment_date']) ??
    new Date(0),
});

const decodedSlug = (value: unknown) =>
  decodeURIComponent(str(value)).normalize('NFC');

const item = (node: Node): WxrItem => {
  const terms = list(node.category);
  const slugs = (domain: string) =>
    terms
      .filter((term) => str(term['@_domain']) === domain)
      .map((term) => decodedSlug(term['@_nicename']))
      .filter(Boolean);
  return {
    id: str(node['wp:post_id']),
    type: str(node['wp:post_type']) || 'post',
    title: str(node.title),
    slug: decodedSlug(node['wp:post_name']),
    html: str(node['content:encoded']),
    excerpt: str(node['excerpt:encoded']),
    status: str(node['wp:status']),
    publishedAt: date(node['wp:post_date_gmt']) ?? date(node['wp:post_date']),
    author: str(node['dc:creator']),
    password: str(node['wp:post_password']),
    sticky: str(node['wp:is_sticky']) === '1',
    commentsOpen: str(node['wp:comment_status']) !== 'closed',
    categories: slugs('category'),
    tags: slugs('post_tag'),
    comments: list(node['wp:comment']).map(comment),
  };
};

const term = (node: Node, kind: 'category' | 'tag'): WxrTerm =>
  kind === 'category'
    ? {
        slug: decodedSlug(node['wp:category_nicename']),
        name: str(node['wp:cat_name']),
        description: str(node['wp:category_description']),
        parent: decodedSlug(node['wp:category_parent']) || null,
      }
    : {
        slug: decodedSlug(node['wp:tag_slug']),
        name: str(node['wp:tag_name']),
        description: str(node['wp:tag_description']),
        parent: null,
      };

/** fast-xml-parser over WXR. Documents with a DTD are refused (no entity expansion). */
export const fastXmlWxrParser: WxrParser = {
  parse(xml) {
    if (/<!DOCTYPE|<!ENTITY/i.test(xml))
      throw invalidInput(Errors.ImportInvalid);
    let root: Node;
    try {
      root = parser.parse(xml) as Node;
    } catch {
      throw invalidInput(Errors.ImportInvalid);
    }
    const channel = (root.rss as Node | undefined)?.channel as Node | undefined;
    if (!channel || !('wp:wxr_version' in channel))
      throw invalidInput(Errors.ImportInvalid);
    const document = {
      title: str(channel.title),
      link: str(channel.link),
      authors: list(channel['wp:author']).map((author) => ({
        login: str(author['wp:author_login']),
        email: str(author['wp:author_email']),
        displayName: str(author['wp:author_display_name']),
      })),
      categories: list(channel['wp:category']).map((node) =>
        term(node, 'category'),
      ),
      tags: list(channel['wp:tag']).map((node) => term(node, 'tag')),
      items: list(channel.item).map(item),
    } satisfies WxrDocument;
    if (
      document.items.length > MAX_ITEMS ||
      document.categories.length + document.tags.length > MAX_TERMS ||
      document.items.reduce(
        (total, entry) => total + entry.comments.length,
        0,
      ) > MAX_COMMENTS
    )
      throw invalidInput(Errors.ImportInvalid);
    return document;
  },
};
