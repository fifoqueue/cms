// Seeds lorem-ipsum demo posts and comments into the configured database, through the same
// services the API uses, so documents are validated and rendered like real saves.
// Rerunning replaces earlier demo data (posts with a `demo-` slug and a "Demo:" title).
//
//   cd apps/api && bun --env-file=../../.env scripts/seed-demo.ts
import { COMMENT_STATUSES } from '@cms/sdk';
import type { CommentStatus, CommentSubmitted, ContentInput } from '@cms/sdk';
import { loadConfig } from '#api/config';
import { createContainer } from '#api/container';
import type { Actor } from '#api/domain/auth/authorization';
import { readInstallationConfig } from '#api/infra/installation/config-store';

const AUTHOR_NAME = 'root';
const PREFIX = 'demo-';
const TITLE_PREFIX = 'Demo:';

// ---------------------------------------------------------------------------------------------
// Lorem ipsum
// ---------------------------------------------------------------------------------------------

const WORDS =
  'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip ex ea commodo consequat duis aute irure in reprehenderit voluptate velit esse cillum fugiat nulla pariatur excepteur sint occaecat cupidatat non proident sunt culpa qui officia deserunt mollit anim id est laborum curabitur pretium tincidunt lacus nulla gravida orci a odio nullam varius turpis et commodo pharetra est eros bibendum elit nec luctus magna felis sollicitudin mauris integer'.split(
    ' ',
  );

/** Deterministic, so reruns produce the same text. */
let state = 20240601;
const random = () => {
  state = (state + 0x6d2b79f5) | 0;
  let value = Math.imul(state ^ (state >>> 15), 1 | state);
  value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
};
const between = (min: number, max: number) =>
  min + Math.floor(random() * (max - min + 1));
const word = () => WORDS[between(0, WORDS.length - 1)]!;
const capitalize = (text: string) => text[0]!.toUpperCase() + text.slice(1);
const sentence = (min = 6, max = 16) =>
  `${capitalize(
    Array.from({ length: between(min, max) }, word).join(' '),
  )}${random() < 0.15 ? '?' : '.'}`;
const sentences = (count: number) =>
  Array.from({ length: count }, () => sentence()).join(' ');

// ---------------------------------------------------------------------------------------------
// Tiptap JSON builders (schema: packages/content/src/extensions.ts)
// ---------------------------------------------------------------------------------------------

type Mark = { type: string; attrs?: Record<string, unknown> };
type Block = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: Block[];
  text?: string;
  marks?: Mark[];
};
type Inline = string | Block;

const text = (value: string, ...marks: Mark[]): Block =>
  marks.length
    ? { type: 'text', text: value, marks }
    : { type: 'text', text: value };
const bold: Mark = { type: 'bold' };
const italic: Mark = { type: 'italic' };
const code: Mark = { type: 'code' };
const strike: Mark = { type: 'strike' };
const underline: Mark = { type: 'underline' };
const link = (href: string): Mark => ({ type: 'link', attrs: { href } });
const hardBreak: Block = { type: 'hardBreak' };

const inline = (parts: Inline[]) =>
  parts.map((part) => (typeof part === 'string' ? text(part) : part));
const paragraph = (...parts: Inline[]): Block => ({
  type: 'paragraph',
  content: inline(parts),
});
const lorem = (count = between(3, 6)) => paragraph(sentences(count));
const heading = (level: 2 | 3 | 4, title: string, anchor?: string): Block => ({
  type: 'heading',
  attrs: anchor ? { level, anchor } : { level },
  content: [text(title)],
});
const listItem = (...blocks: Block[]): Block => ({
  type: 'listItem',
  content: blocks,
});
const bulletList = (...items: Block[]): Block => ({
  type: 'bulletList',
  content: items,
});
const orderedList = (start: number, ...items: Block[]): Block => ({
  type: 'orderedList',
  attrs: { start },
  content: items,
});
const item = (...parts: Inline[]) => listItem(paragraph(...parts));
const blockquote = (...blocks: Block[]): Block => ({
  type: 'blockquote',
  content: blocks,
});
const pullquote = (cite: string, ...blocks: Block[]): Block => ({
  type: 'pullquote',
  attrs: { cite },
  content: blocks,
});
const details = (
  summary: string,
  open: boolean,
  ...blocks: Block[]
): Block => ({
  type: 'details',
  attrs: { open },
  content: [
    { type: 'detailsSummary', content: [text(summary)] },
    { type: 'detailsContent', content: blocks },
  ],
});
const cell = (
  type: 'tableHeader' | 'tableCell',
  ...parts: Inline[]
): Block => ({
  type,
  content: [paragraph(...parts)],
});
const table = (caption: string, header: string[], rows: Inline[][]): Block => ({
  type: 'table',
  attrs: { caption },
  content: [
    {
      type: 'tableRow',
      content: header.map((title) => cell('tableHeader', title)),
    },
    ...rows.map((row) => ({
      type: 'tableRow',
      content: row.map((value) => cell('tableCell', value)),
    })),
  ],
});
const columns = (...columnBlocks: Block[][]): Block => ({
  type: 'columns',
  attrs: { stack: true },
  content: columnBlocks.map((blocks) => ({ type: 'column', content: blocks })),
});
const buttons = (
  align: 'left' | 'center' | 'right',
  ...items: {
    label: string;
    href: string;
    variant: 'fill' | 'outline';
    newTab?: boolean;
  }[]
): Block => ({
  type: 'buttons',
  attrs: { align },
  content: items.map(({ label, href, variant, newTab = false }) => ({
    type: 'button',
    attrs: { href, variant, newTab },
    content: [text(label)],
  })),
});
const spacer = (height: number): Block => ({
  type: 'spacer',
  attrs: { height },
});
const separator: Block = { type: 'horizontalRule' };
const embed = (url: string): Block => ({ type: 'embed', attrs: { url } });
const pageBreak: Block = { type: 'pageBreak' };
const tableOfContents = (title: string): Block => ({
  type: 'tableOfContents',
  attrs: {
    title,
    levels: [2, 3, 4],
    minHeadings: 0,
    excluded: [],
    collapsible: true,
    open: true,
  },
});
const codeBlock = (
  source: string,
  attrs: {
    language?: string | null;
    theme?: string | null;
    label?: string;
    lineNumbers?: boolean;
    startLine?: number;
    highlightLines?: string;
    copyButton?: boolean;
  },
): Block => ({
  type: 'codeBlock',
  attrs: { language: null, ...attrs },
  content: [text(source)],
});
const callout = (
  variant: string,
  dismissible: boolean,
  ...blocks: Block[]
): Block => ({
  type: 'callout',
  attrs: { variant, dismissible },
  content: blocks,
});
const doc = (...content: Block[]): ContentInput['document'] => ({
  type: 'doc',
  content,
});

// ---------------------------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------------------------

const longForm = () =>
  doc(
    paragraph(
      'Lorem ipsum dolor sit amet, ',
      text('consectetur adipiscing elit', bold),
      ', sed do ',
      text('eiusmod tempor', italic),
      ' incididunt ut labore et ',
      text('dolore magna', bold, italic),
      ' aliqua. Ut enim ad ',
      text('minim veniam', link('https://www.lipsum.com/')),
      ', quis nostrud ',
      text('exercitation()', code),
      ' ullamco ',
      text('laboris', strike),
      ' nisi ',
      text('aliquip', underline),
      ' ex ea commodo consequat.',
    ),
    tableOfContents('목차'),
    heading(2, 'Lorem ipsum dolor sit amet'),
    lorem(5),
    lorem(4),
    paragraph(
      sentences(2),
      ' See ',
      text('the anchored section', link('#custom-anchor')),
      ' or ',
      text('an internal page', link('/')),
      ' for more. ',
      sentences(2),
    ),
    heading(3, 'Consectetur adipiscing elit'),
    lorem(),
    bulletList(
      item(text('Lorem ipsum', bold), ' — ', sentence()),
      item('Dolor sit amet with ', text('inline code', code), '.'),
      listItem(
        paragraph('Nested list:'),
        bulletList(item(sentence()), item(sentence())),
      ),
      item(sentence()),
    ),
    lorem(),
    heading(4, 'Sed do eiusmod tempor'),
    lorem(),
    lorem(3),
    heading(2, 'Ut enim ad minim veniam'),
    lorem(5),
    blockquote(
      paragraph(sentences(3)),
      paragraph(text('— Marcus Tullius Cicero', italic)),
    ),
    lorem(),
    pullquote(
      'Cicero, De finibus bonorum et malorum',
      paragraph(
        'Neque porro quisquam est qui dolorem ipsum quia dolor sit amet, consectetur, adipisci velit.',
      ),
    ),
    heading(3, 'Lorem ipsum'),
    lorem(),
    lorem(),
    heading(2, 'Duis aute irure dolor', 'custom-anchor'),
    paragraph(
      'This heading has the explicit anchor ',
      text('#custom-anchor', code),
      '. ',
      sentences(3),
    ),
    orderedList(
      3,
      item('Tertium: ', sentence()),
      item('Quartum: ', sentence()),
      item('Quintum: ', sentence()),
    ),
    details('Lorem ipsum (collapsed)', false, lorem(), lorem(2)),
    details(
      'Dolor sit amet (open by default)',
      true,
      lorem(2),
      bulletList(item(sentence()), item(sentence())),
    ),
    heading(3, 'Lorem ipsum'),
    paragraph(
      'A duplicate heading title: its generated id gets a ',
      text('-2', code),
      ' suffix. ',
      sentences(3),
    ),
    lorem(),
    heading(4, 'In reprehenderit in voluptate'),
    lorem(),
    heading(2, 'Excepteur sint occaecat'),
    lorem(),
    table(
      'Tabula lorem ipsum',
      ['Nomen', 'Descriptio', 'Numerus'],
      [
        ['Lorem', sentence(3, 6), '1'],
        ['Ipsum', sentence(3, 6), '22'],
        ['Dolor', sentence(3, 6), '333'],
        ['Sit amet', sentence(3, 6), '4444'],
      ],
    ),
    lorem(),
    columns(
      [heading(4, 'Columna prima'), lorem(3)],
      [heading(4, 'Columna secunda'), lorem(3)],
      [
        heading(4, 'Columna tertia'),
        bulletList(item(sentence(3, 5)), item(sentence(3, 5))),
      ],
    ),
    heading(3, 'Cupidatat non proident'),
    lorem(),
    buttons(
      'center',
      { label: 'Lorem ipsum', href: '/', variant: 'fill' },
      {
        label: 'Dolor sit amet',
        href: 'https://www.lipsum.com/',
        variant: 'outline',
        newTab: true,
      },
    ),
    spacer(64),
    lorem(3),
    separator,
    heading(3, 'Video embed'),
    paragraph('An embedded YouTube video:'),
    embed('https://www.youtube.com/watch?v=aqz-KE-bpKQ'),
    lorem(),
    heading(2, 'Sunt in culpa qui officia'),
    lorem(6),
    lorem(5),
    lorem(6),
    paragraph(
      text('Finis paginae primae.', bold),
      hardBreak,
      'The article continues on page 2.',
    ),
    pageBreak,
    heading(2, 'Pagina secunda'),
    lorem(5),
    lorem(5),
    heading(3, 'Curabitur pretium tincidunt'),
    lorem(),
    lorem(),
    bulletList(item(sentence()), item(sentence()), item(sentence())),
    heading(4, 'Nulla gravida orci'),
    lorem(),
    lorem(),
    heading(3, 'Lorem ipsum'),
    paragraph(
      'Same title again, on page 2; ids stay unique across pages. ',
      sentences(3),
    ),
    lorem(),
    heading(2, 'Mollit anim id est laborum'),
    lorem(6),
    lorem(5),
    blockquote(paragraph(sentences(2))),
    lorem(6),
    heading(3, 'Integer luctus magna'),
    lorem(5),
    lorem(6),
    lorem(5),
    paragraph(text('Finis.', italic)),
  );

const TYPESCRIPT = `interface Greeting {
  name: string;
  excited?: boolean;
}

export const greet = ({ name, excited = false }: Greeting): string =>
  \`Lorem ipsum, \${name}\${excited ? '!' : '.'}\`;

console.log(greet({ name: 'dolor', excited: true }));`;

const JAVASCRIPT = `const items = ['lorem', 'ipsum', 'dolor'];
const upper = items.map((item) => item.toUpperCase());
console.log(upper.join(', '));
export default upper;`;

const PYTHON = `from dataclasses import dataclass


@dataclass
class Lorem:
    words: list[str]

    def sentence(self) -> str:
        return " ".join(self.words).capitalize() + "."


print(Lorem(["lorem", "ipsum", "dolor"]).sentence())`;

const BASH = `#!/usr/bin/env bash
set -euo pipefail

for word in lorem ipsum dolor; do
  echo "\${word^^}"
done | sort -r`;

const JSON_SOURCE = `{
  "title": "Lorem ipsum",
  "tags": ["dolor", "sit", "amet"],
  "published": true,
  "views": 1024,
  "author": { "name": "Cicero", "url": null }
}`;

const CSS = `:root {
  --lorem-accent: oklch(62% 0.19 260);
}

.lorem-card {
  display: grid;
  gap: 1rem;
  padding: clamp(1rem, 2vw, 2rem);
  border-radius: 0.75rem;
  background: color-mix(in oklch, var(--lorem-accent) 10%, white);
}`;

const HTML = `<!doctype html>
<html lang="la">
  <head>
    <meta charset="utf-8" />
    <title>Lorem ipsum</title>
  </head>
  <body>
    <main class="lorem-card">
      <h1>Dolor sit amet</h1>
      <p>Consectetur <a href="#">adipiscing</a> elit.</p>
    </main>
  </body>
</html>`;

const RUST = `use std::collections::HashMap;

fn main() {
    let text = "lorem ipsum dolor sit amet lorem ipsum";
    let mut counts: HashMap<&str, usize> = HashMap::new();
    for word in text.split_whitespace() {
        *counts.entry(word).or_insert(0) += 1;
    }
    println!("{counts:?}");
}`;

const GO = `package main

import "fmt"

func main() {
\twords := []string{"lorem", "ipsum", "dolor"}
\tfor i, word := range words {
\t\tif i%2 == 0 {
\t\t\tfmt.Println(i, word)
\t\t} else {
\t\t\tfmt.Printf("\\t%d\\t%s\\n", i, word)
\t\t}
\t}
}`;

const SQL = `SELECT c.title, COUNT(m.id) AS comments
FROM contents AS c
LEFT JOIN comments AS m ON m.content_id = c.id AND m.status = 'approved'
WHERE c.slug LIKE 'demo-%'
GROUP BY c.id
ORDER BY comments DESC;`;

const LONG_LINE = `curl --silent --show-error --fail --location --header "Accept: application/json" --header "User-Agent: lorem-ipsum-dolor-sit-amet/1.0" "https://example.com/api/v1/content?search=lorem+ipsum+dolor+sit+amet+consectetur+adipiscing+elit&category=demo-lorem&tag=demo-alpha&page=1&pageSize=100" | jq '.items[] | {title, path, publishedAt}'
echo "${'lorem ipsum dolor sit amet '.repeat(12).trim()}"`;

const codeBlocks = () =>
  doc(
    paragraph(
      'Code blocks in every supported style. Blocks without a theme follow the site theme (',
      text('auto', code),
      '); others use an explicit Shiki theme.',
    ),
    heading(2, 'TypeScript — default theme, line numbers, highlighted lines'),
    codeBlock(TYPESCRIPT, {
      language: 'typescript',
      label: 'src/greet.ts',
      lineNumbers: true,
      highlightLines: '6-7',
    }),
    heading(2, 'JavaScript — Dracula, starts at line 42'),
    paragraph(
      'Uses the ',
      text('js', code),
      ' alias; highlighted rows 1 and 3.',
    ),
    codeBlock(JAVASCRIPT, {
      language: 'js',
      theme: 'dracula',
      label: 'lorem.js',
      lineNumbers: true,
      startLine: 42,
      highlightLines: '1,3',
    }),
    heading(2, 'Python — GitHub Light, no copy button'),
    codeBlock(PYTHON, {
      language: 'python',
      theme: 'github-light',
      copyButton: false,
    }),
    heading(2, 'Bash — Nord'),
    codeBlock(BASH, { language: 'bash', theme: 'nord', label: 'lorem.sh' }),
    heading(2, 'JSON — Monokai'),
    codeBlock(JSON_SOURCE, {
      language: 'json',
      theme: 'monokai',
      label: 'lorem.json',
      lineNumbers: true,
    }),
    heading(2, 'CSS — default theme'),
    codeBlock(CSS, {
      language: 'css',
      lineNumbers: true,
      highlightLines: '5-9',
    }),
    heading(2, 'HTML — Solarized Light'),
    codeBlock(HTML, {
      language: 'html',
      theme: 'solarized-light',
      label: 'index.html',
    }),
    heading(2, 'Rust — Rosé Pine Moon'),
    codeBlock(RUST, {
      language: 'rust',
      theme: 'rose-pine-moon',
      label: 'src/main.rs',
      lineNumbers: true,
    }),
    heading(2, 'Go — tabs and indentation'),
    codeBlock(GO, {
      language: 'go',
      theme: 'github-dark',
      label: 'main.go',
      lineNumbers: true,
      highlightLines: '7-11',
    }),
    heading(2, 'SQL — One Dark Pro, no copy button'),
    codeBlock(SQL, {
      language: 'sql',
      theme: 'one-dark-pro',
      copyButton: false,
    }),
    heading(2, 'Plain text'),
    codeBlock(
      'Lorem ipsum dolor sit amet.\n  Indented two spaces.\n\tIndented one tab.\n\nNo language: no highlighting.',
      { label: 'plain.txt' },
    ),
    heading(2, 'Long lines (horizontal scroll)'),
    codeBlock(LONG_LINE, {
      language: 'bash',
      label: 'long-line.sh',
      lineNumbers: true,
    }),
    paragraph(sentences(2)),
  );

const callouts = () =>
  doc(
    paragraph('All eight callout variants, some dismissible, some nested.'),
    callout(
      'primary',
      false,
      heading(3, 'Primary callout'),
      paragraph(
        sentences(2),
        ' ',
        text('Bold', bold),
        ' and ',
        text('a link', link('https://www.lipsum.com/')),
        '.',
      ),
    ),
    callout(
      'secondary',
      true,
      paragraph(text('Secondary (dismissible). ', bold), sentences(2)),
    ),
    callout(
      'success',
      true,
      paragraph(text('Success (dismissible). ', bold), sentence()),
      bulletList(item(sentence(3, 6)), item(sentence(3, 6))),
    ),
    callout('danger', false, paragraph(text('Danger. ', bold), sentences(2))),
    callout(
      'warning',
      true,
      heading(4, 'Warning with a heading'),
      orderedList(
        1,
        item(sentence(3, 6)),
        item(sentence(3, 6)),
        item(sentence(3, 6)),
      ),
    ),
    callout(
      'info',
      false,
      paragraph(text('Info with a nested list:', bold)),
      bulletList(
        item(sentence(3, 6)),
        listItem(
          paragraph(sentence(3, 6)),
          bulletList(item(sentence(3, 6)), item(sentence(3, 6))),
        ),
      ),
      paragraph('Inline ', text('code()', code), ' inside a callout.'),
    ),
    callout('light', false, paragraph(text('Light. ', bold), sentences(2))),
    callout(
      'dark',
      true,
      paragraph(text('Dark (dismissible). ', bold), sentences(2)),
    ),
    heading(2, 'Nested callouts'),
    callout(
      'primary',
      false,
      paragraph(
        text('Outer primary callout ', bold),
        'containing an inner one:',
      ),
      callout(
        'warning',
        true,
        paragraph('Inner warning (dismissible). ', sentence()),
      ),
    ),
    columns(
      [
        callout(
          'success',
          false,
          paragraph('Callout in column 1. ', sentence()),
        ),
      ],
      [
        callout(
          'danger',
          true,
          paragraph('Callout in column 2 (dismissible). ', sentence()),
        ),
      ],
    ),
    details(
      'Callout inside a details block',
      true,
      callout('info', false, paragraph(sentences(2))),
    ),
    blockquote(
      callout(
        'secondary',
        false,
        paragraph('Callout inside a blockquote. ', sentence()),
      ),
    ),
    paragraph(sentences(2)),
  );

const shortPost = () => doc(paragraph(sentences(3)));

const taxonomyPost = () =>
  doc(
    paragraph(sentences(4)),
    { type: 'more' },
    lorem(),
    heading(2, 'Lorem ipsum'),
    lorem(),
    lorem(),
  );

// ---------------------------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------------------------

const config = loadConfig({
  ...process.env,
  DATABASE_URL:
    process.env.DATABASE_URL ?? readInstallationConfig()?.DATABASE_URL,
});
if (!config.DATABASE_URL)
  throw new Error('No database configured: finish the setup wizard first.');

const container = await createContainer({
  ...config,
  DATABASE_URL: config.DATABASE_URL,
});
const services = container.app.decorator;
const { adminContent: content, comments, adminTaxonomy: taxonomy } = services;

const chunks = <T>(values: T[], size: number) =>
  Array.from({ length: Math.ceil(values.length / size) }, (_, index) =>
    values.slice(index * size, index * size + size),
  );

const seed = async () => {
  // Plugins take part in saves (filters, block checks) exactly as in the server.
  await container.plugins.boot();

  const user = await container.db.user.findFirst({
    where: { name: AUTHOR_NAME },
    select: { id: true, role: true },
  });
  if (!user) throw new Error(`No user named "${AUTHOR_NAME}" found.`);
  const actor: Actor = {
    id: user.id,
    role: user.role,
    capabilities: await services.roles.capabilities(user.role),
  };

  // --- Remove previous demo data -----------------------------------------------------------
  const previous: { id: string; slug: string }[] = [];
  for (const view of ['active', 'trash'] as const)
    for (let page = 1; ; page += 1) {
      const result = await content.list(
        { type: 'post', view, page, pageSize: 100, search: 'Demo' },
        actor,
      );
      previous.push(
        ...result.items.filter(
          (entry) =>
            entry.slug.startsWith(PREFIX) &&
            entry.title.startsWith(TITLE_PREFIX),
        ),
      );
      if (page * result.pageSize >= result.total) break;
    }
  let removedComments = 0;
  for (const entry of previous) {
    for (const status of COMMENT_STATUSES) {
      for (;;) {
        const { items } = await comments.list(
          { contentId: entry.id, status, pageSize: 100 },
          actor,
        );
        if (!items.length) break;
        await comments.bulk(
          { ids: items.map((comment) => comment.id), action: 'delete' },
          actor,
        );
        removedComments += items.length;
      }
    }
    await content.remove(entry.id, actor);
  }
  console.log(
    `Removed ${previous.length} previous demo posts and ${removedComments} comments.`,
  );

  // --- Terms --------------------------------------------------------------------------------
  const term = async (
    kind: 'category' | 'tag',
    slug: string,
    name: string,
    parentId: string | null = null,
  ) => {
    const input = {
      name,
      slug,
      parentId,
      description: `Demo ${kind}: lorem ipsum.`,
    };
    const existing = (await taxonomy.list(kind)).find(
      (candidate) => candidate.slug === slug,
    );
    return existing
      ? taxonomy.update(kind, existing.id, input)
      : taxonomy.create(kind, input);
  };
  const category = await term('category', 'demo-lorem', 'Demo Lorem');
  const subcategory = await term(
    'category',
    'demo-ipsum',
    'Demo Ipsum',
    category.id,
  );
  const tags = await Promise.all([
    term('tag', 'demo-alpha', 'demo alpha'),
    term('tag', 'demo-beta', 'demo beta'),
    term('tag', 'demo-gamma', 'demo gamma'),
  ]);

  // Only an image already in the library; nothing is uploaded.
  const image = (
    await services.media.list({ kind: 'image', pageSize: 1 }, actor)
  ).items[0];

  // --- Posts --------------------------------------------------------------------------------
  const now = Date.now();
  const minutesAgo = (minutes: number) =>
    new Date(now - minutes * 60_000).toISOString();
  const create = (input: Omit<ContentInput, 'type'>) =>
    content.create({ type: 'post', ...input }, actor);

  const posts = {
    longForm: await create({
      title: 'Demo: Long-form article',
      slug: 'demo-long-form-article',
      excerpt:
        'A long lorem ipsum article with every editor block and two pages.',
      document: longForm(),
      status: 'published',
      publishedAt: minutesAgo(1),
      categoryIds: [category.id],
      tagIds: [tags[0]!.id],
    }),
    code: await create({
      title: 'Demo: Code blocks',
      slug: 'demo-code-blocks',
      document: codeBlocks(),
      status: 'published',
      publishedAt: minutesAgo(2),
      categoryIds: [category.id],
    }),
    callouts: await create({
      title: 'Demo: Callouts',
      slug: 'demo-callouts',
      document: callouts(),
      status: 'published',
      publishedAt: minutesAgo(3),
      categoryIds: [category.id],
    }),
    short: await create({
      title: 'Demo: Short post',
      slug: 'demo-short-post',
      document: shortPost(),
      status: 'published',
      publishedAt: minutesAgo(4),
      categoryIds: [category.id],
    }),
    terms: await create({
      title: 'Demo: Categories and tags',
      slug: 'demo-categories-and-tags',
      excerpt:
        'Lorem ipsum dolor sit amet: a post with demo categories, tags and a hand-written excerpt.',
      document: taxonomyPost(),
      status: 'published',
      publishedAt: minutesAgo(5),
      categoryIds: [category.id, subcategory.id],
      tagIds: tags.map((tag) => tag.id),
      ...(image && { featuredMediaId: image.id }),
    }),
    scheduled: await create({
      title: 'Demo: Scheduled post',
      slug: 'demo-scheduled-post',
      document: doc(paragraph(sentences(3))),
      status: 'scheduled',
      publishedAt: new Date(now + 30 * 24 * 60 * 60_000).toISOString(),
      categoryIds: [category.id],
    }),
    draft: await create({
      title: 'Demo: Draft post',
      slug: 'demo-draft-post',
      document: doc(paragraph(sentences(3))),
      status: 'draft',
      categoryIds: [category.id],
    }),
  };

  // --- Comments -----------------------------------------------------------------------------
  const discussion = await comments.discussion();
  const guests = [
    {
      authorName: 'Lorem Ipsum',
      authorEmail: 'lorem@example.com',
      authorUrl: 'https://www.lipsum.com/',
    },
    {
      authorName: 'Dolor Sit',
      authorEmail: 'dolor@example.com',
      authorUrl: '',
    },
    {
      authorName: 'Amet Consectetur',
      authorEmail: 'amet@example.com',
      authorUrl: 'https://example.com/amet',
    },
    {
      authorName: 'Adipiscing Elit',
      authorEmail: 'elit@example.org',
      authorUrl: '',
    },
    {
      authorName: 'Sed Eiusmod',
      authorEmail: 'sed@example.net',
      authorUrl: 'https://example.net/',
    },
    {
      authorName: '로렘 입숨',
      authorEmail: 'korean@example.com',
      authorUrl: '',
    },
    {
      authorName: 'Tempor Incididunt',
      authorEmail: 'tempor@example.com',
      authorUrl: '',
    },
  ];
  let submitted = 0;
  const idOf = (result: CommentSubmitted) =>
    result.comment?.id ?? result.pendingProof!.split('.')[0]!;
  /** A visitor's comment, as the public form would send it (a fresh rate-limit bucket each). */
  const guest = async (
    contentId: string,
    body: string,
    parentId: string | null = null,
  ) => {
    const index = submitted++;
    return idOf(
      await comments.submit(
        { contentId, parentId, body, ...guests[index % guests.length]! },
        { client: `seed-demo-${index}`, address: null, captchaToken: null },
      ),
    );
  };
  const commentBody = () =>
    random() < 0.12
      ? `${sentences(between(2, 4))}\n\n${sentences(between(3, 5))}\n\n${sentences(2)}`
      : sentences(between(1, 4));
  const setStatus = async (
    ids: string[],
    action: 'approve' | 'unapprove' | 'spam' | 'trash',
  ) => {
    for (const group of chunks(ids, 100))
      await comments.bulk({ ids: group, action }, actor);
  };

  // Long-form: enough approved top-level comments for two comment pages.
  const article = posts.longForm.id;
  const topLevel: string[] = [];
  for (let index = 0; index < discussion.pageSize + 8; index += 1)
    topLevel.push(
      await guest(
        article,
        index === 0
          ? `Primus! ${sentences(3)}\n\n${sentences(4)}\n\n${sentences(2)} Vale.`
          : commentBody(),
      ),
    );
  await setStatus(topLevel, 'approve');

  // Threads down to the deepest shown level (`threadDepth` counts the top level).
  for (const root of [
    topLevel[0]!,
    topLevel[1]!,
    topLevel[4]!,
    topLevel.at(-1)!,
  ]) {
    let parent = root;
    for (let level = 1; level < discussion.threadDepth; level += 1) {
      const replies = [
        await guest(article, sentences(between(1, 3)), parent),
        ...(level === 1 ? [await guest(article, sentences(2), parent)] : []),
      ];
      await setStatus(replies, 'approve');
      parent = replies[0]!;
    }
  }
  // The post author answers (the "글쓴이" badge) on a top-level comment and inside a thread.
  await comments.reply(
    topLevel[0]!,
    { body: `Gratias tibi! ${sentences(2)}` },
    actor,
  );
  await comments.reply(topLevel[1]!, { body: sentences(2) }, actor);
  await comments.submit(
    {
      contentId: article,
      parentId: null,
      body: `Nota auctoris: ${sentences(3)}`,
    },
    { client: 'seed-demo-author', address: null, captchaToken: null },
    [],
    actor,
  );

  const pending = [
    await guest(article, sentences(2)),
    await guest(article, `${sentences(3)}\n\n${sentences(2)}`),
    await guest(article, sentence()),
    await guest(article, sentences(2), topLevel[2]!),
  ];
  await setStatus(pending, 'unapprove');
  const spam = [
    await guest(
      article,
      'Buy cheap lorem ipsum now! https://spam.example.com https://spam.example.org https://spam.example.net',
    ),
    await guest(article, `Click here: ${sentence()} https://spam.example.com`),
    await guest(article, sentences(2)),
  ];
  await setStatus(spam, 'spam');
  await setStatus([await guest(article, `Trash: ${sentence()}`)], 'trash');

  // A few on the other posts.
  const approved: string[] = [];
  for (let index = 0; index < 3; index += 1)
    approved.push(await guest(posts.code.id, commentBody()));
  approved.push(await guest(posts.callouts.id, commentBody()));
  approved.push(await guest(posts.callouts.id, commentBody()));
  approved.push(await guest(posts.short.id, sentence()));
  approved.push(await guest(posts.terms.id, commentBody()));
  approved.push(await guest(posts.terms.id, commentBody()));
  await setStatus(approved, 'approve');
  await setStatus(
    [await guest(posts.callouts.id, sentences(2), approved[3]!)],
    'approve',
  );
  await comments.reply(approved[0]!, { body: sentences(2) }, actor);
  await setStatus([await guest(posts.code.id, sentences(2))], 'unapprove');
  await setStatus([await guest(posts.terms.id, `Spam: ${sentence()}`)], 'spam');

  // --- Report -------------------------------------------------------------------------------
  console.log('\nPosts:');
  for (const entry of Object.values(posts))
    console.log(
      `  ${entry.status.padEnd(9)} ${entry.path.padEnd(36)} ${entry.title}`,
    );
  if (!image)
    console.log('  (no image in the media library: no featured image set)');

  console.log(
    `\nComments (discussion: ${discussion.pageSize} per page, thread depth ${discussion.threadDepth}, moderation ${discussion.moderation}):`,
  );
  const totals = Object.fromEntries(
    COMMENT_STATUSES.map((status) => [status, 0]),
  ) as Record<CommentStatus, number>;
  for (const entry of Object.values(posts)) {
    const counts = await Promise.all(
      COMMENT_STATUSES.map(
        async (status) =>
          [
            status,
            (
              await comments.list(
                { contentId: entry.id, status, pageSize: 1 },
                actor,
              )
            ).total,
          ] as const,
      ),
    );
    if (counts.every(([, count]) => count === 0)) continue;
    for (const [status, count] of counts) totals[status] += count;
    console.log(
      `  ${entry.path.padEnd(36)} ${counts.map(([status, count]) => `${status} ${count}`).join(', ')}`,
    );
  }
  console.log(
    `  ${'total'.padEnd(36)} ${COMMENT_STATUSES.map((status) => `${status} ${totals[status]}`).join(', ')}`,
  );
  const thread = await comments.publicPage(article, 1);
  console.log(
    `  ${posts.longForm.path}: ${thread.total} top-level comments → ${Math.ceil(thread.total / thread.pageSize)} comment pages`,
  );
};

try {
  await seed();
} finally {
  await container.plugins.stop();
  await container.db.$disconnect();
}
