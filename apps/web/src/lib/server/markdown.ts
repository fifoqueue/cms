// Public HTML to readable Markdown for the `/<slug>.md` alternate. Only the published HTML is
// read; scripts, styles, embeds and unsafe link schemes are dropped, and every piece of text is
// escaped so content cannot inject Markdown links, raw HTML or block markup.
import { parseFragment } from 'parse5';
import type { DefaultTreeAdapterTypes } from 'parse5';
import type { PublicContent } from '@cms/sdk';

type Node = DefaultTreeAdapterTypes.ChildNode;
type Element = DefaultTreeAdapterTypes.Element;

/** Elements whose content is never readable text. */
const SKIPPED = new Set([
  'script',
  'style',
  'template',
  'noscript',
  'iframe',
  'object',
  'embed',
  'svg',
  'math',
  'canvas',
  'audio',
  'video',
  'head',
  'title',
  'meta',
  'link',
  'base',
  'form',
  'input',
  'button',
  'select',
  'textarea',
]);

const BLOCKS = new Set([
  'address',
  'article',
  'aside',
  'blockquote',
  'caption',
  'dd',
  'details',
  'div',
  'dl',
  'dt',
  'fieldset',
  'figcaption',
  'figure',
  'footer',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'hgroup',
  'hr',
  'li',
  'main',
  'nav',
  'ol',
  'p',
  'pre',
  'section',
  'summary',
  'table',
  'tbody',
  'tfoot',
  'thead',
  'tr',
  'ul',
]);

const SAFE_SCHEMES = new Set(['http:', 'https:', 'mailto:']);
/** Base for resolving links when no site origin is configured; stripped again from results. */
const LOCAL_ORIGIN = 'https://site.invalid';

const isElement = (node: Node): node is Element => 'tagName' in node;

const attr = (element: Element, name: string) =>
  element.attrs.find((attribute) => attribute.name === name)?.value;

const percent = (char: string) =>
  `%${char.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`;

/**
 * `value` resolved against `base` as a Markdown link destination, or `undefined` for anything
 * but http(s)/mailto. Characters that could end the destination are percent-encoded; existing
 * encodings are kept. Results on `LOCAL_ORIGIN` come back as root-relative paths.
 */
export const markdownUrl = (value: string | undefined, base: string) => {
  const url = value?.trim() ? URL.parse(value.trim(), base) : null;
  if (!url || !SAFE_SCHEMES.has(url.protocol)) return undefined;
  const href =
    url.origin === LOCAL_ORIGIN
      ? url.href.slice(LOCAL_ORIGIN.length)
      : url.href;
  return href.replace(/[\s()<>\\]/g, percent);
};

/** Plain text as one line of inline Markdown: whitespace collapsed, syntax characters escaped. */
export const markdownInline = (value: string) =>
  value
    .replace(/\s+/g, ' ')
    .replace(/[\\`*_[\]<>~|]/g, '\\$&')
    .replace(/&(?=#?\w+;)/g, '\\&');

/** Escapes what would turn the start of a text line into a heading, quote, list or rule. */
const escapeLineStart = (line: string) =>
  /^[-=]+$/.test(line)
    ? `\\${line}`
    : line
        .replace(/^(#{1,6}|[-+])(?=\s|$)/, '\\$1')
        .replace(/^>/, '\\>')
        .replace(/^(\d+)([.)])(?=\s|$)/, '$1\\$2');

/** Inline text with `\n` hard breaks into a paragraph. */
const paragraph = (text: string) =>
  text
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
    .map(escapeLineStart)
    .join('\\\n');

const singleLine = (text: string) => text.replace(/\s+/g, ' ').trim();

const textContent = (node: Node): string => {
  if (node.nodeName === '#text')
    return (node as DefaultTreeAdapterTypes.TextNode).value;
  if (!isElement(node) || SKIPPED.has(node.tagName)) return '';
  if (node.tagName === 'br') return '\n';
  return node.childNodes.map(textContent).join('');
};

const longestRun = (text: string, char: string) =>
  Math.max(
    0,
    ...(text.match(new RegExp(`${char}+`, 'g')) ?? []).map((run) => run.length),
  );

/** Surrounds trimmed text with `marker`, keeping outer whitespace outside the delimiters. */
const wrap = (marker: string, text: string) => {
  const core = text.trim();
  if (!core) return text;
  const start = text.slice(0, text.indexOf(core));
  const end = text.slice(text.indexOf(core) + core.length);
  return `${start}${marker}${core}${marker}${end}`;
};

const codeSpan = (raw: string) => {
  const code = raw.replace(/\s+/g, ' ');
  if (!code.trim()) return '';
  const fence = '`'.repeat(longestRun(code, '`') + 1);
  const pad = code.startsWith('`') || code.endsWith('`') ? ' ' : '';
  return `${fence}${pad}${code}${pad}${fence}`;
};

interface Context {
  /** Resolves a link or image source; `undefined` when it must not be linked. */
  url: (value: string | undefined) => string | undefined;
  /** Footnote definitions collected from `cms-footnotes` sections, emitted at the end. */
  footnotes: string[];
  /** Labels of converted references and of footnote list items, recorded by the first pass. */
  refs: Set<string>;
  items: Set<string>;
  /** Labels with both a reference and a list item; unset during the first pass. */
  matched?: Set<string>;
}

/**
 * Footnote label for a renderer id `fn-{page}-{n}` / `fn-ref-{page}-{n}`. Numbering is
 * page-local and the alternate holds every page, so later pages get `p{page}-{n}` labels.
 */
const footnoteLabel = (id: string | undefined) => {
  const match = /^(?:fn|fn-ref)-(\d+)-(\d+)$/.exec(id ?? '');
  if (!match) return undefined;
  return match[1] === '1' ? match[2] : `p${match[1]}-${match[2]}`;
};

const hasClass = (element: Element, name: string) =>
  (attr(element, 'class') ?? '').split(/\s+/).includes(name);

/**
 * A footnote section: items matching a converted reference become `[^label]: text`
 * definitions (back-links dropped); any other item's text stays as plain paragraphs in place.
 */
const footnoteSection = (section: Element, context: Context) => {
  const items = section.childNodes
    .filter(isElement)
    .filter((child) => child.tagName === 'ol')
    .flatMap((ol) => ol.childNodes.filter(isElement))
    .filter((child) => child.tagName === 'li');
  const orphans: string[] = [];
  for (const item of items) {
    const label = footnoteLabel(attr(item, 'id'));
    const span = item.childNodes
      .filter(isElement)
      .find((child) => child.tagName === 'span');
    const nodes =
      span?.childNodes ??
      item.childNodes.filter(
        (child) => !isElement(child) || child.tagName !== 'a',
      );
    const text = paragraph(singleLine(inline(nodes, context)));
    if (!context.matched) {
      if (label && text) context.items.add(label);
    } else if (label && context.matched.delete(label)) {
      if (text) context.footnotes.push(`[^${label}]: ${text}`);
    } else if (text) orphans.push(text);
  }
  return orphans.join('\n\n');
};

const inline = (nodes: Node[], context: Context): string =>
  nodes.map((node) => inlineNode(node, context)).join('');

const inlineNode = (node: Node, context: Context): string => {
  if (node.nodeName === '#text')
    return markdownInline((node as DefaultTreeAdapterTypes.TextNode).value);
  if (!isElement(node) || SKIPPED.has(node.tagName)) return '';
  const children = () => inline(node.childNodes, context);
  switch (node.tagName) {
    case 'br':
      return '\n';
    case 'strong':
    case 'b':
      return wrap('**', children());
    case 'em':
    case 'i':
      return wrap('*', children());
    case 's':
    case 'del':
    case 'strike':
      return wrap('~~', children());
    case 'code':
    case 'kbd':
    case 'samp':
      return codeSpan(textContent(node));
    case 'a': {
      const href = context.url(attr(node, 'href'));
      const text = singleLine(children());
      if (!href) return children();
      return `[${text || markdownInline(href)}](${href})`;
    }
    case 'sup': {
      const ref = node.childNodes
        .filter(isElement)
        .find(
          (child) =>
            child.tagName === 'a' && attr(child, 'data-footnote-ref') != null,
        );
      if (!ref) return children();
      const label = footnoteLabel(attr(ref, 'href')?.replace(/^#/, ''));
      if (label && !context.matched) context.refs.add(label);
      return label && (!context.matched || context.items.has(label))
        ? `[^${label}]`
        : markdownInline(textContent(node));
    }
    case 'img': {
      const src = context.url(attr(node, 'src'));
      return src ? `![${markdownInline(attr(node, 'alt') ?? '')}](${src})` : '';
    }
    case 'td':
    case 'th':
      return ` ${children()} `;
  }
  return BLOCKS.has(node.tagName) ? ` ${children()} ` : children();
};

const codeBlock = (pre: Element) => {
  const code = pre.childNodes
    .filter(isElement)
    .find((child) => child.tagName === 'code');
  const raw = textContent(code ?? pre).replace(/\n+$/, '');
  if (!raw.trim()) return '';
  const language =
    /(?:^|\s)language-([\w+-]+)/.exec(attr(code ?? pre, 'class') ?? '')?.[1] ??
    '';
  const fence = '`'.repeat(Math.max(3, longestRun(raw, '`') + 1));
  return `${fence}${language}\n${raw}\n${fence}`;
};

const list = (element: Element, context: Context) => {
  const ordered = element.tagName === 'ol';
  let number = Number.parseInt(attr(element, 'start') ?? '', 10) || 1;
  return element.childNodes
    .filter(isElement)
    .filter((child) => child.tagName === 'li')
    .map((item) => {
      const marker = ordered ? `${number++}. ` : '- ';
      const indent = ' '.repeat(marker.length);
      const body = blocks(item.childNodes, context)
        .join('\n')
        .split('\n')
        .map((line, index) => (index === 0 || !line ? line : indent + line))
        .join('\n');
      return `${marker}${body}`.trimEnd();
    })
    .join('\n');
};

const block = (element: Element, context: Context): string => {
  if (element.tagName === 'nav' && hasClass(element, 'cms-toc')) return '';
  if (element.tagName === 'section' && hasClass(element, 'cms-footnotes'))
    return footnoteSection(element, context);
  const heading = /^h([1-6])$/.exec(element.tagName);
  if (heading) {
    const text = singleLine(inline(element.childNodes, context));
    return text && `${'#'.repeat(Number(heading[1]))} ${text}`;
  }
  switch (element.tagName) {
    case 'ul':
    case 'ol':
      return list(element, context);
    case 'pre':
      return codeBlock(element);
    case 'hr':
      return '---';
    case 'blockquote': {
      const quoted = blocks(element.childNodes, context).join('\n\n');
      return quoted
        .split('\n')
        .map((line) => (line ? `> ${line}` : '>'))
        .join('\n')
        .replace(/^>$/, '');
    }
  }
  return blocks(element.childNodes, context).join('\n\n');
};

/** Block-level Markdown; inline runs between block elements become paragraphs. */
const blocks = (nodes: Node[], context: Context): string[] => {
  const output: string[] = [];
  let run: Node[] = [];
  const flush = () => {
    const text = paragraph(inline(run, context));
    if (text) output.push(text);
    run = [];
  };
  for (const node of nodes) {
    if (isElement(node) && BLOCKS.has(node.tagName)) {
      flush();
      const text = block(node, context);
      if (text) output.push(text);
    } else run.push(node);
  }
  flush();
  return output;
};

/**
 * Readable Markdown for an HTML fragment; relative links resolve against `base`. Footnote
 * references with a matching list item become `[^label]` and their definitions follow the
 * body. A first pass records which references and items exist, so only matched pairs are
 * emitted as footnotes.
 */
export const htmlToMarkdown = (html: string, base: string) => {
  const nodes = parseFragment(html).childNodes;
  const context: Context = {
    url: (value) => markdownUrl(value, base),
    footnotes: [],
    refs: new Set(),
    items: new Set(),
  };
  blocks(nodes, context);
  context.matched = context.refs.intersection(context.items);
  context.items = new Set(context.matched);
  const output = blocks(nodes, context);
  if (context.footnotes.length) output.push(context.footnotes.join('\n'));
  return output.join('\n\n');
};

/**
 * The Markdown alternate of a published entry: title, truthful source facts (canonical HTML
 * URL, publication and update dates, public byline) and the converted body. No editor
 * document, plugin meta or admin data is read. `origin` is the configured site origin or ''.
 */
export const contentMarkdown = (content: PublicContent, origin: string) => {
  const base = `${origin || LOCAL_ORIGIN}${content.path}`;
  const canonical = markdownUrl(content.path, base) ?? content.path;
  const author = content.seo.authorName
    ? markdownInline(content.seo.authorName)
    : '';
  const authorUrl = markdownUrl(content.seo.authorUrl, base);
  const facts = [
    `- Canonical: [${markdownInline(canonical)}](${canonical})`,
    `- Published: ${markdownInline(content.publishedAt)}`,
    `- Updated: ${markdownInline(content.updatedAt)}`,
    author && `- Author: ${authorUrl ? `[${author}](${authorUrl})` : author}`,
  ];
  const summary = singleLine(content.excerpt);
  return `${[
    `# ${markdownInline(content.title).trim()}`,
    summary && `> ${markdownInline(summary)}`,
    facts.filter(Boolean).join('\n'),
    '---',
    htmlToMarkdown(content.html, base),
  ]
    .filter(Boolean)
    .join('\n\n')}\n`;
};
