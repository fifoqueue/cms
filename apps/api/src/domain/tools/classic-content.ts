// WordPress classic-editor content: shortcodes and "autop" paragraphs become the HTML the shared
// content schema parses (figures, galleries, embeds, audio and video). Pure text transforms; the
// schema still decides what survives, and unknown shortcodes stay as text.

/** Attribute values of a shortcode (`key="value"`, `key='value'` or `key=value`). */
const attributes = (source: string) =>
  Object.fromEntries(
    [
      ...source.matchAll(/([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s\]]+))/g),
    ].map((match) => [
      match[1]!.toLowerCase(),
      match[2] ?? match[3] ?? match[4] ?? '',
    ]),
  );

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

/** WordPress `wpautop`: blank lines separate paragraphs, single line breaks become `<br>`. */
const paragraphs = (html: string) =>
  html
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) =>
      BLOCK_START.test(chunk)
        ? chunk
        : `<p>${chunk.replace(/\n/g, '<br>')}</p>`,
    )
    .join('');

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
  const converted = html
    .replace(
      /\[caption([^\]]*)\]([\s\S]*?)\[\/caption\]/gi,
      (whole, source: string, inner: string) => {
        const media =
          /^\s*((?:<a\b[^>]*>\s*)?<img\b[^>]*>(?:\s*<\/a>)?)([\s\S]*)$/i.exec(
            inner,
          );
        if (!media) return inner;
        const attrs = attributes(source);
        const align = /^align(left|right|center|none)$/.exec(attrs.align ?? '')
          ? attrs.align
          : '';
        const caption = attrs.caption ?? media[2]!.trim();
        return block(
          `<figure class="wp-block-image ${align}">${media[1]}${caption ? `<figcaption>${caption}</figcaption>` : ''}</figure>`,
        );
      },
    )
    .replace(/\[gallery([^\]]*)\]/gi, (_, source: string) => {
      const attrs = attributes(source);
      const urls = attrs.ids
        ? attrs.ids
            .split(',')
            .map((id) => attachments.url(id.trim()))
            .filter((url): url is string => !!url)
        : attachments.childImages(entryId);
      const columns = Math.min(Math.max(Number(attrs.columns) || 3, 1), 6);
      return urls.length
        ? block(
            `<figure class="wp-block-gallery columns-${columns}">${urls
              .map((url) => `<img src="${escape(url)}" alt="">`)
              .join('')}</figure>`,
          )
        : '';
    })
    .replace(/\[embed[^\]]*\]([\s\S]*?)\[\/embed\]/gi, (whole, url: string) => {
      const address = webUrl(url);
      return address ? embed(address) : whole;
    })
    .replace(
      /\[(audio|video)([^\]]*)\](?:\[\/\1\])?/gi,
      (whole, kind, source) => {
        const attrs = attributes(source as string);
        const src = webUrl(
          attrs.src ??
            (kind.toLowerCase() === 'audio'
              ? (attrs.mp3 ?? attrs.ogg ?? attrs.wav ?? attrs.m4a)
              : (attrs.mp4 ?? attrs.webm ?? attrs.ogv ?? attrs.m4v)),
        );
        return src
          ? block(
              `<${kind.toLowerCase()} src="${escape(src)}"></${kind.toLowerCase()}>`,
            )
          : whole;
      },
    )
    // WordPress auto-embeds a URL that stands alone on its line.
    .replace(/^[ \t]*(https?:\/\/[^\s<>"]+)[ \t]*$/gim, (whole, url: string) =>
      embed(url),
    );
  return converted.includes('<!-- wp:') ? converted : paragraphs(converted);
};
