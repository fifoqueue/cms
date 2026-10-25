/** A run of comment text: plain, or a web address shown as a link to `href`. */
export type CommentSegment = { text: string; href?: string };

/**
 * `http(s)://` followed by ASCII address characters, not glued to a preceding word or path.
 * Letters outside ASCII end an address, so `https://example.com에서` links only the address.
 */
const ADDRESS =
  /(?<![A-Za-z0-9_@/.:-])https?:\/\/[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]+/gi;
/** Sentence punctuation that ends a text rather than an address. */
const TRAILING = new Set(['.', ',', ';', ':', '!', '?', "'", '"', '*']);
const CLOSERS: Record<string, string> = { ')': '(', ']': '[' };

const count = (text: string, char: string) => text.split(char).length - 1;

/** Drops trailing punctuation, and closing brackets the address itself never opened. */
const trim = (address: string) => {
  let end = address.length;
  while (end) {
    const last = address[end - 1]!;
    const opener = CLOSERS[last];
    const kept = address.slice(0, end);
    if (
      TRAILING.has(last) ||
      (opener && count(kept, opener) < count(kept, last))
    )
      end--;
    else break;
  }
  return address.slice(0, end);
};

/** The address as an absolute http(s) URL with a host, or null. */
const linkable = (address: string) => {
  try {
    const url = new URL(address);
    return (url.protocol === 'http:' || url.protocol === 'https:') &&
      url.hostname
      ? url.href
      : null;
  } catch {
    return null;
  }
};

/**
 * Plain comment text split into text and web-address segments. Only absolute `http(s)` addresses
 * become links; everything else stays text for the template to escape.
 */
export const linkify = (text: string): CommentSegment[] => {
  const segments: CommentSegment[] = [];
  let at = 0;
  for (const match of text.matchAll(ADDRESS)) {
    const address = trim(match[0]);
    const href = linkable(address);
    if (!href) continue;
    if (match.index > at) segments.push({ text: text.slice(at, match.index) });
    segments.push({ text: address, href });
    at = match.index + address.length;
  }
  if (at < text.length || !segments.length)
    segments.push({ text: text.slice(at) });
  return segments;
};

/** Whether `href` leaves `origin` (the site's own address). */
export const isExternal = (href: string, origin: string) =>
  new URL(href, origin).origin !== origin;

/**
 * What a pointer gesture on a comment link would open, when it leaves `origin` and so needs
 * confirming first: a primary click (a new tab with a modifier) or a middle click (always a new
 * tab). Other gestures and same-site links proceed as usual (null).
 */
export const leaveFor = (
  event: Pick<
    MouseEvent,
    'type' | 'button' | 'metaKey' | 'ctrlKey' | 'shiftKey'
  >,
  href: string,
  origin: string,
) => {
  const primary = event.type === 'click' && event.button === 0;
  const middle = event.type === 'auxclick' && event.button === 1;
  if (!(primary || middle) || !isExternal(href, origin)) return null;
  return {
    href,
    newTab: middle || event.metaKey || event.ctrlKey || event.shiftKey,
  };
};
