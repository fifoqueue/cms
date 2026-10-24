// Characters `decodePathname` leaves encoded, so literal route text must match their encoded form.
const encoded: Record<string, string> = {
  '%': '%25',
  '/': '%2[Ff]',
  '?': '%3[Ff]',
  '#': '%23',
};

/** Kit's `escape`: regex-escape literal text, matching `%/?#` in their encoded forms. */
const escape = (text: string) =>
  text
    .normalize()
    .split(/([%/?#])/)
    .map((part, index) =>
      index % 2 ? encoded[part] : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
    )
    .join('');

/** A literal part of a segment, with SvelteKit's `[x+hh]` / `[u+hhhh-hhhh]` escapes decoded. */
const literal = (text: string) =>
  text
    .split(/\[[ux]\+([0-9a-fA-F-]+)\]/)
    .map((part, index) =>
      escape(
        index % 2
          ? String.fromCodePoint(...part.split('-').map((h) => parseInt(h, 16)))
          : part,
      ),
    )
    .join('');

/** Kit's `decode_pathname`: decode everything except `%25`, which params decode later. */
export const decodePathname = (pathname: string) =>
  pathname.split('%25').map(decodeURI).join('%25');

/**
 * The pathname pattern of a SvelteKit route ID, as Kit's `parse_route_id` builds it: groups are
 * dropped, `[x]` / `[x=matcher]` match one segment, `[...x]` any rest, `[[x]]` an optional segment.
 * Matchers are not run, so a matcher route matches every value its shape allows.
 */
export const routePattern = (id: string) => {
  if (id === '/') return /^\/$/;
  const segments = id
    .slice(1)
    .split('/')
    .filter((segment) => !/^\(.+\)$/.test(segment));
  const body = segments
    .map((segment) => {
      if (/^\[\.\.\.[^\]]+\]$/.test(segment)) return '(?:/[^]*)?';
      if (/^\[\[[^\]]+\]\]$/.test(segment)) return '(?:/[^/]+)?';
      return `/${segment
        .split(/(\[\[[^\]]+\]\]|\[\.\.\.[^\]]+\]|\[(?![ux]\+)[^\]]+\])/)
        .map((part, index) =>
          index % 2 === 0
            ? literal(part)
            : part.startsWith('[[')
              ? '[^/]*'
              : part.startsWith('[...')
                ? '[^]*?'
                : '[^/]+?',
        )
        .join('')}`;
    })
    .join('');
  // A root group such as `/(site)` is the root route.
  return body ? new RegExp(`^${body}/?$`) : /^\/$/;
};

/**
 * Whether a URL pathname (as `URL#pathname` gives it: encoded, under `base`) belongs to one of
 * the given route IDs. Paths outside `base` and malformed encodings belong to none.
 */
export const routeMatcher = (ids: Iterable<string>) => {
  const patterns = [...ids].map(routePattern);
  return (pathname: string, base = '') => {
    if (base && pathname !== base && !pathname.startsWith(`${base}/`))
      return false;
    let path: string;
    try {
      path = decodePathname(pathname.slice(base.length) || '/');
    } catch {
      return false;
    }
    return patterns.some((pattern) => pattern.test(path));
  };
};
