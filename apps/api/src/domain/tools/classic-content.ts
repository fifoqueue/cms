// WordPress classic-editor content: shortcodes and "autop" paragraphs become the HTML the shared
// content schema parses (figures, galleries, embeds, audio and video). Pure text transforms; the
// schema still decides what survives, and unknown shortcodes stay as text.

import { Errors, invalidInput } from '#api/shared/errors';

const MAX_INPUT = 1024 * 1024;
const MAX_OUTPUT = 2 * MAX_INPUT;
const MAX_SHORTCODES = 1000;
const MAX_ATTRIBUTES = 8192;
const encoder = new TextEncoder();

/** Bound generated HTML before joining fragments or passing it to the document parser. */
const bounded = (parts: Iterable<string>) => {
  const output: string[] = [];
  let size = 0;
  for (const part of parts) {
    size += encoder.encode(part).length;
    if (size > MAX_OUTPUT) throw invalidInput(Errors.ImportContentLimit);
    output.push(part);
  }
  return output.join('');
};

/** Sticky matching consumes each attribute token once, including malformed attributes. */
const attributes = (source: string) => {
  const pairs: [string, string][] = [];
  const token = /\s*([\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s\]]+)))?/y;
  for (let offset = 0; offset < source.length;) {
    token.lastIndex = offset;
    const match = token.exec(source);
    if (!match) {
      offset++;
      continue;
    }
    offset = token.lastIndex;
    const value = match[2] ?? match[3] ?? match[4];
    if (value !== undefined) pairs.push([match[1]!.toLowerCase(), value]);
  }
  return Object.fromEntries(pairs);
};

const escape = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

/** Only http(s) addresses become media or embeds. */
const webUrl = (value: string | undefined) =>
  value && /^https?:\/\/[^\s"<>]+$/i.test(value.trim()) ? value.trim() : null;

/** Separated from the text around it, so paragraphs form around the block. */
const block = (html: string) => `\n\n${html}\n\n`;

const embed = (url: string) =>
  block(
    `<figure data-embed-url="${escape(url)}" class="embed"><a href="${escape(url)}">${escape(url)}</a></figure>`,
  );

const BLOCK_START =
  /^<(?:p|div|h[1-6]|ul|ol|li|blockquote|pre|figure|table|hr|details|video|audio|iframe|!--)\b/i;

/** Paragraph conversion never splits or trims a preformatted region. */
const paragraphs = (html: string) => {
  const normalized = html.replace(/\r\n?/g, '\n');
  const lower = normalized.toLowerCase();
  const pre = /<pre\b/gi;
  const plain = (text: string) =>
    bounded(
      text
        .split(/\n[ \t]*\n/)
        .map((chunk) => chunk.trim())
        .filter(Boolean)
        .map((chunk) =>
          BLOCK_START.test(chunk)
            ? chunk
            : `<p>${chunk.replace(/\n/g, '<br>')}</p>`,
        ),
    );
  return bounded(
    (function* () {
      let offset = 0;
      for (let match; (match = pre.exec(normalized));) {
        yield plain(normalized.slice(offset, match.index));
        const close = lower.indexOf('</pre', pre.lastIndex);
        const end = close === -1 ? -1 : normalized.indexOf('>', close + 5);
        offset = end === -1 ? normalized.length : end + 1;
        yield normalized.slice(match.index, offset);
        pre.lastIndex = offset;
      }
      yield plain(normalized.slice(offset));
    })(),
  );
};

/** Library files the content refers to: attachment URLs by WordPress id, and per parent entry. */
export interface ClassicAttachments {
  url(id: string): string | undefined;
  /** Image URLs attached to the entry with this WordPress id (`[gallery]` without `ids`). */
  childImages(parentId: string): string[];
}

/**
 * Converts `[caption]`, `[gallery]`, `[embed]`, `[audio]` and `[video]` and adds paragraphs to
 * classic content. Block-editor content (`<!-- wp:` comments) already has its markup, so only
 * its shortcodes are converted.
 */
export const classicHtml = (
  html: string,
  entryId: string,
  attachments: ClassicAttachments,
): string => {
  if (encoder.encode(html).length > MAX_INPUT)
    throw invalidInput(Errors.ImportContentLimit);
  const lower = html.toLowerCase();
  const opening = /\[(caption|gallery|embed|audio|video)\b/gi;
  const unclosed = new Set<string>();
  let work = 0;
  const charge = () => {
    if (++work > MAX_SHORTCODES) throw invalidInput(Errors.ImportContentLimit);
  };
  const converted = bounded(
    (function* () {
      let offset = 0;
      for (let match; (match = opening.exec(html));) {
        charge();
        yield html.slice(offset, match.index);
        const end = html.indexOf(']', opening.lastIndex);
        if (end === -1) {
          offset = match.index;
          break;
        }
        const source = html.slice(opening.lastIndex, end);
        if (source.length > MAX_ATTRIBUTES)
          throw invalidInput(Errors.ImportContentLimit);
        const kind = match[1]!.toLowerCase();
        offset = end + 1;
        const attrs = attributes(source);
        let output = html.slice(match.index, offset);
        if (kind === 'caption' || kind === 'embed') {
          const closing = `[/${kind}]`;
          const close = unclosed.has(kind)
            ? -1
            : lower.indexOf(closing, offset);
          if (close === -1) unclosed.add(kind);
          else {
            const inner = html.slice(offset, close);
            offset = close + closing.length;
            output = html.slice(match.index, offset);
            if (kind === 'embed') {
              const address = webUrl(inner);
              if (address && address.length <= 2048) output = embed(address);
            } else {
              const media =
                /^\s*((?:<a\b[^>]*>\s*)?<img\b[^>]*>(?:\s*<\/a>)?)([\s\S]*)$/i.exec(
                  inner,
                );
              if (!media) output = inner;
              else {
                const align = /^align(left|right|center|none)$/.test(
                  attrs.align ?? '',
                )
                  ? attrs.align
                  : '';
                const caption = attrs.caption ?? media[2]!.trim();
                output = block(
                  `<figure class="wp-block-image ${align}">${media[1]}${caption ? `<figcaption>${caption}</figcaption>` : ''}</figure>`,
                );
              }
            }
          }
        } else if (kind === 'gallery') {
          const urls = attrs.ids
            ? attrs.ids
                .split(',')
                .map((id) => attachments.url(id.trim()))
                .filter((url): url is string => !!url)
            : attachments.childImages(entryId);
          if (urls.length > 100 || urls.some((url) => url.length > 2048))
            throw invalidInput(Errors.ImportContentLimit);
          const columns = Math.min(Math.max(Number(attrs.columns) || 3, 1), 6);
          output = urls.length
            ? block(
                `<figure class="wp-block-gallery columns-${columns}">${bounded(urls.map((url) => `<img src="${escape(url)}" alt="">`))}</figure>`,
              )
            : '';
        } else {
          const src = webUrl(
            attrs.src ??
              (kind === 'audio'
                ? (attrs.mp3 ?? attrs.ogg ?? attrs.wav ?? attrs.m4a)
                : (attrs.mp4 ?? attrs.webm ?? attrs.ogv ?? attrs.m4v)),
          );
          const closing = `[/${kind}]`;
          if (lower.startsWith(closing, offset)) offset += closing.length;
          output =
            src && src.length <= 2048
              ? block(`<${kind} src="${escape(src)}"></${kind}>`)
              : html.slice(match.index, offset);
        }
        yield output;
        opening.lastIndex = offset;
      }
      yield html.slice(offset);
    })(),
  );
  // Auto-embeds share the work/output budgets with explicit shortcodes.
  const linked = bounded(
    (function* () {
      let offset = 0;
      for (const match of converted.matchAll(
        /^[ \t]*(https?:\/\/[^\s<>"]+)[ \t]*$/gim,
      )) {
        charge();
        yield converted.slice(offset, match.index);
        const address = match[1]!;
        yield address.length <= 2048 ? embed(address) : match[0];
        offset = match.index + match[0].length;
      }
      yield converted.slice(offset);
    })(),
  );
  return linked.includes('<!-- wp:') ? linked : paragraphs(linked);
};
