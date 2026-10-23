import { z } from 'zod';
import { Errors } from '#sdk/errors';

/**
 * Configurable, WordPress-style permalinks: one path template per content type. A template is a
 * leading `/` followed by unreserved ASCII literals and `%token%` placeholders, e.g.
 * `/p/%year%%month%%date%` or `/post/%title%`. Expanded paths are canonical: every token value is
 * percent-encoded exactly once (`encodeURIComponent`), literals never need encoding, so stored
 * paths compare byte for byte (no case or accent folding).
 */

export const PERMALINK_CONTENT_TYPES = ['post', 'article', 'page'] as const;
export type PermalinkContentType = (typeof PERMALINK_CONTENT_TYPES)[number];

/** Date tokens use UTC; `%title%`, `%slug%` and `%id%` are `encodeURIComponent` of the value. */
export const PERMALINK_TOKENS = [
  'year',
  'month',
  'date',
  'title',
  'slug',
  'id',
  'monthnum',
  'day',
  'hour',
  'minute',
  'second',
  'post_id',
  'postname',
  'category',
  'author',
  'pagename',
] as const;
export type PermalinkToken = (typeof PERMALINK_TOKENS)[number];

export const MAX_PERMALINK_PATTERN_LENGTH = 200;
/** Longest expanded path, in characters (always ASCII). */
export const MAX_PERMALINK_PATH_LENGTH = 4096;

export const DEFAULT_PERMALINK_PATTERN = '/%slug%';

/** Characters a template may contain outside its tokens: unreserved URL characters and `/`. */
const LITERAL = /^[\p{L}\p{N} \-._~/]*$/u;

/** First path segments owned by the admin area, the API and built-in assets. */
const RESERVED_ROOTS = ['admin', 'api', '_app'];
/** Roots whose nested paths are archives or generated listings; the bare root stays usable. */
const RESERVED_PREFIXES = [
  'taxonomy',
  'category',
  'tag',
  'sitemaps',
  'author',
  'preview',
  'media',
  'archive',
  'date',
];
/** Exact paths of generated documents. */
const RESERVED_FILES = [
  '/robots.txt',
  '/sitemap.xml',
  '/feed.xml',
  '/llms.txt',
];

const UNSAFE_SEGMENT = /[\\/?#\p{Cc}\p{Zl}\p{Zp}]/u;

/** A safe decoded segment re-encoded with `encodeURIComponent`; `null` for unsafe input. */
const canonicalSegment = (segment: string): string | null => {
  try {
    const decoded = decodeURIComponent(segment);
    return !decoded ||
      decoded === '.' ||
      decoded === '..' ||
      UNSAFE_SEGMENT.test(decoded)
      ? null
      : encodeURIComponent(decoded);
  } catch {
    return null;
  }
};

/**
 * The canonical spelling of a request pathname, or `null` when it cannot be one: each segment is
 * decoded once and re-encoded with `encodeURIComponent`, so `%c3%a9`, `é` and `%C3%A9` agree.
 * Empty/dot segments, encoded separators, query/fragment delimiters and controls are refused;
 * case and accents are never folded.
 */
export const canonicalPermalinkPath = (path: string): string | null => {
  if (!path.startsWith('/')) return null;

  const segments: string[] = [];

  const trailing = path.endsWith('/');
  for (const segment of path.slice(1, trailing ? -1 : undefined).split('/')) {
    const canonical = canonicalSegment(segment);

    if (canonical === null) return null;
    segments.push(canonical);
  }

  return `/${segments.join('/')}${trailing ? '/' : ''}`;
};

/** Why `path` is not a canonical content path (structure only, no reservation), or `undefined`. */
const structureIssue = (path: string): string | undefined => {
  if (path.length > MAX_PERMALINK_PATH_LENGTH) return 'Path is too long';
  if (canonicalPermalinkPath(path) !== path)
    return 'Path must be a canonical percent-encoded path without empty, "." or ".." segments';
  return undefined;
};

/**
 * A stored content path as served (`PublicContent.path`) and used as a redirect target: exactly
 * one leading `/`, ASCII only, canonically percent-encoded segments (no backslash, control
 * characters, query, fragment, `//authority` or dot segments). Reserved routes are checked when
 * paths are written (`permalinkPathIssue`), not here.
 */
export const permalinkPathSchema = z
  .string()
  .min(2)
  .max(MAX_PERMALINK_PATH_LENGTH)
  .superRefine((path, context) => {
    const issue = structureIssue(path);

    if (issue) context.addIssue({ code: 'custom', message: issue });
  });

/**
 * Why `path` cannot be a new content URL, or `undefined` when it can: it must pass
 * `permalinkPathSchema` and stay outside reserved routes. Reservation ignores case, so no
 * spelling of a reserved route can be claimed; matching content paths never folds case.
 */
export const permalinkPathIssue = (path: string): string | undefined => {
  const issue = structureIssue(path);

  if (issue) return issue;

  const segments = path.slice(1).replace(/\/$/, '').split('/');
  const lower = path.replace(/\/$/, '').toLowerCase();
  const root = segments[0]!.toLowerCase();

  if (
    RESERVED_ROOTS.includes(root) ||
    (RESERVED_PREFIXES.includes(root) && segments.length > 1) ||
    RESERVED_FILES.includes(lower) ||
    lower.endsWith('.md')
  )
    return 'Path is reserved';

  return undefined;
};

/** `pattern` split at `%`: even indexes are literals, odd indexes token names. */
const partsOf = (pattern: string) => pattern.split('%');

const isToken = (name: string): name is PermalinkToken =>
  (PERMALINK_TOKENS as readonly string[]).includes(name);

/** Why `pattern` is not a valid template, or `undefined`. */
const patternIssue = (pattern: string): string | undefined => {
  const parts = partsOf(pattern);

  if (parts.length % 2 === 0) return 'Unmatched "%"';
  if (parts.length < 3) return 'Template needs at least one %token%';

  for (const [index, part] of parts.entries()) {
    if (index % 2 === 1 && !isToken(part)) return `Unknown token %${part}%`;
    if (index % 2 === 0 && !LITERAL.test(part))
      return 'Only letters, digits, "-", ".", "_", "~" and "/" may appear outside tokens';
  }

  // Every token value is non-empty, so a placeholder expansion has the same segment structure.
  const path = canonicalPermalinkPath(
    parts.map((part, index) => (index % 2 === 1 ? 'x' : part)).join(''),
  );
  return path ? permalinkPathIssue(path) : 'Invalid path';
};

export const permalinkPatternSchema = z
  .string()
  .max(MAX_PERMALINK_PATTERN_LENGTH)
  .superRefine((pattern, context) => {
    const issue = patternIssue(pattern);

    if (issue) context.addIssue({ code: 'custom', message: issue });
  });

/**
 * Templates by content type key. The built-in types always have one; a custom type without one
 * uses `/<key>/%slug%` (`permalinkPatternFor`).
 */
export const permalinkSettingsSchema = z
  .record(
    z
      .string()
      .max(32)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    permalinkPatternSchema,
  )
  .refine(
    (settings) => PERMALINK_CONTENT_TYPES.every((type) => type in settings),
    Errors.PermalinkBuiltinsRequired,
  );

export type PermalinkSettings = Record<string, string>;

/** The template entries of `type` use. */
export const permalinkPatternFor = (
  settings: PermalinkSettings,
  type: string,
) => settings[type] ?? `/${type}/%slug%`;

/** Whether `key` can name a custom content type: not a built-in or a reserved route. */
export const isReservedTypeKey = (key: string) =>
  (PERMALINK_CONTENT_TYPES as readonly string[]).includes(key) ||
  RESERVED_ROOTS.includes(key) ||
  RESERVED_PREFIXES.includes(key);

/** Every fresh site serves content at `/<slug>`, as before permalinks were configurable. */
export const DEFAULT_PERMALINK_SETTINGS: PermalinkSettings = {
  post: DEFAULT_PERMALINK_PATTERN,
  article: DEFAULT_PERMALINK_PATTERN,
  page: '/%pagename%',
};

export interface PermalinkValues {
  author?: string;
  category?: readonly string[];
  parents?: readonly string[];
  id: string;
  slug: string;
  title: string;
  /** ISO time of the first publication; `null` before it, when `createdAt` dates the path. */
  publishedAt: string | null;
  createdAt: string;
}

const pad = (value: number, length: number) =>
  String(value).padStart(length, '0');

/**
 * Expands a valid template. Throws `TypeError` for unknown tokens or an invalid date and
 * `URIError` for values `encodeURIComponent` refuses (lone surrogates). The result still needs
 * `permalinkPathIssue`: values such as a title `..` or `robots.txt` can produce unusable paths.
 */
export const renderPermalink = (
  pattern: string,
  values: PermalinkValues,
): string => {
  const date = new Date(values.publishedAt ?? values.createdAt);

  if (Number.isNaN(date.getTime())) throw new TypeError(Errors.InvalidDate);

  const tokens: Record<PermalinkToken, () => string> = {
    monthnum: () => pad(date.getUTCMonth() + 1, 2),
    day: () => pad(date.getUTCDate(), 2),
    hour: () => pad(date.getUTCHours(), 2),
    minute: () => pad(date.getUTCMinutes(), 2),
    second: () => pad(date.getUTCSeconds(), 2),
    post_id: () => encodeURIComponent(values.id),
    postname: () => encodeURIComponent(values.slug),
    author: () => encodeURIComponent(values.author || 'author'),
    category: () =>
      (values.category?.length ? values.category : ['uncategorized'])
        .map((part) => encodeURIComponent(part))
        .join('/'),
    pagename: () =>
      [...(values.parents ?? []), values.slug]
        .map((part) => encodeURIComponent(part))
        .join('/'),
    year: () => pad(date.getUTCFullYear(), 4),
    month: () => pad(date.getUTCMonth() + 1, 2),
    date: () => pad(date.getUTCDate(), 2),
    title: () => encodeURIComponent(values.title),
    slug: () => encodeURIComponent(values.slug),
    id: () => encodeURIComponent(values.id),
  };

  const rendered = partsOf(pattern)
    .map((part, index) => {
      if (index % 2 === 0) return part;
      if (!isToken(part))
        throw new TypeError(Errors.UnknownPermalinkToken(part));
      return tokens[part]();
    })
    .join('');
  return canonicalPermalinkPath(rendered) ?? rendered;
};

/**
 * `GET /api/v1/resolve?path=` query. `path` is the request's percent-encoded pathname, sent as an
 * ordinary query value (so it travels encoded twice and arrives encoded once).
 */
export const resolvePathQuerySchema = z.object({
  path: z
    .string()
    .min(1)
    .max(MAX_PERMALINK_PATH_LENGTH * 3),
});

export type ResolvePathQuery = z.input<typeof resolvePathQuerySchema>;
