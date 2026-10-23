// WordPress eXtended RSS (WXR 1.2), the format of WordPress "Tools → Export/Import".

export interface WxrAuthor {
  login: string;
  email: string;
  displayName: string;
}

export interface WxrTerm {
  /** WordPress term id (`wp:term_id`), for menu items that link to terms. */
  id?: string;
  slug: string;
  name: string;
  description: string;
  /** Parent slug (categories only). */
  parent: string | null;
}

export interface WxrComment {
  id: string;
  parentId: string | null;
  authorName: string;
  authorEmail: string;
  authorUrl: string;
  body: string;
  /** WordPress `comment_approved`: `1`, `0`, `spam` or `trash`. */
  approved: string;
  /** Empty or `comment` for comments; `pingback`/`trackback` otherwise. */
  type: string;
  createdAt: Date;
}

export interface WxrItem {
  id: string;
  /** WordPress post type: `post`, `page`, `attachment`, custom types … */
  type: string;
  title: string;
  slug: string;
  html: string;
  excerpt: string;
  /** WordPress status: `publish`, `draft`, `pending`, `future`, `private`, `trash` … */
  status: string;
  publishedAt: Date | null;
  /** Author login. */
  author: string;
  password: string;
  sticky: boolean;
  commentsOpen: boolean;
  categories: string[];
  tags: string[];
  comments: WxrComment[];
  /** The entry's public URL on the old site (`link`). */
  link?: string;
  /** WordPress id of the parent entry (`wp:post_parent`), `0`/empty for none. */
  parentId?: string;
  /** `wp:menu_order`. */
  menuOrder?: number;
  /** Attachments: the file's URL (`wp:attachment_url`). */
  attachmentUrl?: string;
  /** `wp:postmeta` values this importer reads or writes (`_thumbnail_id`, `_menu_item_*`, `wp_pattern_sync_status`). */
  meta?: Record<string, string>;
  /** Navigation menus (`nav_menu` terms) a menu item belongs to: slug and name. */
  menus?: { slug: string; name: string }[];
}

export interface WxrDocument {
  title: string;
  link: string;
  /** `wp:base_site_url`: old URLs on this origin can become redirects. */
  baseUrl?: string;
  authors: WxrAuthor[];
  categories: WxrTerm[];
  tags: WxrTerm[];
  items: WxrItem[];
}

/** Reads WXR; throws `invalid_input` for anything that is not a WXR document. */
export interface WxrParser {
  parse(xml: string): WxrDocument;
}

/** Drops control characters XML 1.0 cannot carry (tab, line feed and carriage return stay). */
const xmlSafe = (value: string) =>
  value.replace(/\p{Cc}/gu, (char) => ('\t\n\r'.includes(char) ? char : ''));

const text = (value: string) =>
  xmlSafe(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

/** CDATA cannot contain `]]>`, so that sequence is split across two sections. */
const cdata = (value: string) =>
  `<![CDATA[${xmlSafe(value).replace(/\]\]>/g, ']]]]><![CDATA[>')}]]>`;

const pad = (value: number) => String(value).padStart(2, '0');
/** `YYYY-MM-DD HH:MM:SS` in UTC, as WordPress writes `*_gmt` dates. */
const sqlDate = (date: Date | null) =>
  date
    ? `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`
    : '0000-00-00 00:00:00';

const tag = (name: string, value: string) => `<${name}>${value}</${name}>`;

type WxrHeader = Omit<WxrDocument, 'items'>;
export interface WxrTermNames {
  categories: ReadonlyMap<string, string>;
  tags: ReadonlyMap<string, string>;
}

export const wxrTermNames = (document: WxrHeader): WxrTermNames => ({
  categories: new Map(
    document.categories.map((term) => [term.slug, term.name]),
  ),
  tags: new Map(document.tags.map((term) => [term.slug, term.name])),
});

export const wxrHeader = (document: WxrHeader) => {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8" ?>',
    '<rss version="2.0" xmlns:excerpt="http://wordpress.org/export/1.2/excerpt/" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:wfw="http://wellformedweb.org/CommentAPI/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:wp="http://wordpress.org/export/1.2/">',
    '<channel>',
    tag('title', text(document.title)),
    tag('link', text(document.link)),
    tag('wp:wxr_version', '1.2'),
    tag('wp:base_site_url', text(document.link)),
    tag('wp:base_blog_url', text(document.link)),
  ];
  document.authors.forEach((author, index) =>
    lines.push(
      `<wp:author>${tag('wp:author_id', String(index + 1))}${tag('wp:author_login', cdata(author.login))}${tag('wp:author_email', cdata(author.email))}${tag('wp:author_display_name', cdata(author.displayName))}</wp:author>`,
    ),
  );
  document.categories.forEach((term, index) =>
    lines.push(
      `<wp:category>${tag('wp:term_id', String(index + 1))}${tag('wp:category_nicename', cdata(term.slug))}${tag('wp:category_parent', cdata(term.parent ?? ''))}${tag('wp:cat_name', cdata(term.name))}${tag('wp:category_description', cdata(term.description))}</wp:category>`,
    ),
  );
  document.tags.forEach((term, index) =>
    lines.push(
      `<wp:tag>${tag('wp:term_id', String(document.categories.length + index + 1))}${tag('wp:tag_slug', cdata(term.slug))}${tag('wp:tag_name', cdata(term.name))}${tag('wp:tag_description', cdata(term.description))}</wp:tag>`,
    ),
  );
  return `${lines.join('\n')}\n`;
};

export const wxrItemStart = (
  item: WxrItem,
  document: WxrHeader,
  names = wxrTermNames(document),
) => {
  const terms = [
    ...item.categories.map(
      (slug) =>
        `<category domain="category" nicename="${text(slug)}">${cdata(names.categories.get(slug) ?? slug)}</category>`,
    ),
    ...item.tags.map(
      (slug) =>
        `<category domain="post_tag" nicename="${text(slug)}">${cdata(names.tags.get(slug) ?? slug)}</category>`,
    ),
  ];
  return [
    '<item>',
    tag('title', cdata(item.title)),
    ...(item.link ? [tag('link', text(item.link))] : []),
    tag('dc:creator', cdata(item.author)),
    `<guid isPermaLink="false">${text(item.id)}</guid>`,
    tag('content:encoded', cdata(item.html)),
    tag('excerpt:encoded', cdata(item.excerpt)),
    tag('wp:post_id', text(item.id)),
    tag('wp:post_date_gmt', cdata(sqlDate(item.publishedAt))),
    tag('wp:comment_status', cdata(item.commentsOpen ? 'open' : 'closed')),
    tag('wp:post_name', cdata(item.slug)),
    tag('wp:status', cdata(item.status)),
    tag('wp:post_type', cdata(item.type)),
    tag('wp:post_parent', text(item.parentId || '0')),
    tag('wp:post_password', cdata(item.password)),
    tag('wp:is_sticky', item.sticky ? '1' : '0'),
    ...terms,
    ...Object.entries(item.meta ?? {}).map(
      ([key, value]) =>
        `<wp:postmeta>${tag('wp:meta_key', cdata(key))}${tag('wp:meta_value', cdata(value))}</wp:postmeta>`,
    ),
  ].join('');
};

export const wxrComment = (comment: WxrComment) =>
  `<wp:comment>${tag('wp:comment_id', text(comment.id))}${tag('wp:comment_author', cdata(comment.authorName))}${tag('wp:comment_author_email', cdata(comment.authorEmail))}${tag('wp:comment_author_url', text(comment.authorUrl))}${tag('wp:comment_date_gmt', sqlDate(comment.createdAt))}${tag('wp:comment_content', cdata(comment.body))}${tag('wp:comment_approved', cdata(comment.approved))}${tag('wp:comment_type', cdata(comment.type))}${tag('wp:comment_parent', text(comment.parentId ?? '0'))}</wp:comment>`;

export const wxrItemEnd = '</item>\n';
export const wxrFooter = '</channel>\n</rss>\n';

/** A WXR 1.2 document WordPress (and this CMS) can import. */
export const buildWxr = (document: WxrDocument): string => {
  const names = wxrTermNames(document);
  return [
    wxrHeader(document),
    ...document.items.flatMap((item) => [
      wxrItemStart(item, document, names),
      ...item.comments.map(wxrComment),
      wxrItemEnd,
    ]),
    wxrFooter,
  ].join('');
};

// Body markers the editor stores, and how WordPress writes the same things.
const MORE = '<div class="cms-more" data-cms-more="true"></div>';
const NEXT_PAGE = '<div class="cms-nextpage" data-cms-nextpage="true"></div>';
const PATTERN =
  /<div class="cms-pattern" data-cms-pattern="([A-Za-z0-9-]{1,36})"><\/div>/g;

/** Stored body HTML as WordPress writes it: `<!--more-->`, `<!--nextpage-->`, `wp:block` references. */
export const toWordPressHtml = (html: string) =>
  html
    .replaceAll(MORE, '<!--more-->')
    .replaceAll(NEXT_PAGE, '<!--nextpage-->')
    .replace(PATTERN, '<!-- wp:block {"ref":"$1"} /-->');

/**
 * WordPress markers as the editor's elements before the HTML is parsed. Pattern references use
 * the ids the import gave the file's patterns; unknown ones are dropped.
 */
export const fromWordPressHtml = (
  html: string,
  patterns: ReadonlyMap<string, string>,
) =>
  html
    // Blank lines around each marker keep classic-content paragraphs from wrapping it.
    .replace(
      /<!--more(?:\s[^>]*)?-->/g,
      '\n\n<div data-cms-more="true"></div>\n\n',
    )
    .replace(/<!--nextpage-->/g, '\n\n<div data-cms-nextpage="true"></div>\n\n')
    .replace(
      /<!--\s*wp:block\s+\{\s*"ref"\s*:\s*"?([\w-]{1,36})"?\s*\}\s*\/-->/g,
      (_, ref: string) => {
        const id = patterns.get(ref);
        return id ? `\n\n<div data-cms-pattern="${id}"></div>\n\n` : '';
      },
    );
