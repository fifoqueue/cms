export interface DiffLine {
  kind: 'same' | 'removed' | 'added';
  text: string;
}

/**
 * Line diff by longest common subsequence: what `before` loses and `after` gains.
 * Quadratic, so it is meant for one entry's text, not whole sites.
 */
export const lineDiff = (before: string[], after: string[]): DiffLine[] => {
  const rows = before.length;
  const columns = after.length;
  const lengths: number[][] = Array.from({ length: rows + 1 }, () =>
    Array<number>(columns + 1).fill(0),
  );
  for (let i = rows - 1; i >= 0; i--)
    for (let j = columns - 1; j >= 0; j--)
      lengths[i]![j] =
        before[i] === after[j]
          ? lengths[i + 1]![j + 1]! + 1
          : Math.max(lengths[i + 1]![j]!, lengths[i]![j + 1]!);
  const lines: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < rows && j < columns)
    if (before[i] === after[j]) {
      lines.push({ kind: 'same', text: before[i]! });
      i++;
      j++;
    } else if (lengths[i + 1]![j]! >= lengths[i]![j + 1]!)
      lines.push({ kind: 'removed', text: before[i++]! });
    else lines.push({ kind: 'added', text: after[j++]! });
  while (i < rows) lines.push({ kind: 'removed', text: before[i++]! });
  while (j < columns) lines.push({ kind: 'added', text: after[j++]! });
  return lines;
};

/** One row of a side-by-side diff: a removed line next to the line that replaced it. */
export interface DiffRow {
  before?: string;
  after?: string;
  changed: boolean;
}

/** Pairs each run of removed lines with the added lines that follow it. */
export const sideBySide = (lines: DiffLine[]): DiffRow[] => {
  const rows: DiffRow[] = [];
  for (let index = 0; index < lines.length;) {
    const line = lines[index]!;
    if (line.kind === 'same') {
      rows.push({ before: line.text, after: line.text, changed: false });
      index++;
      continue;
    }
    const removed: string[] = [];
    const added: string[] = [];
    while (lines[index]?.kind === 'removed') removed.push(lines[index++]!.text);
    while (lines[index]?.kind === 'added') added.push(lines[index++]!.text);
    for (let row = 0; row < Math.max(removed.length, added.length); row++)
      rows.push({ before: removed[row], after: added[row], changed: true });
  }
  return rows;
};

interface Node {
  type?: unknown;
  text?: unknown;
  attrs?: Record<string, unknown>;
  content?: unknown;
}

/** Names for blocks without text, in the reader's language. */
export interface BlockLabels {
  image: string;
  audio: string;
  embed: string;
  pattern: string;
}

const inline = (node: Node): string =>
  typeof node.text === 'string'
    ? node.text
    : node.type === 'footnote'
      ? `[*${String(node.attrs?.name ?? '')}${node.attrs?.text ? ` ${String(node.attrs.text)}` : ''}]`
      : node.type === 'hardBreak'
        ? ' '
        : Array.isArray(node.content)
          ? (node.content as Node[]).map(inline).join('')
          : '';

/**
 * An editor document as readable lines, one per block: headings, list items, quotes, code
 * lines, table rows and media keep a short marker so a diff shows what kind of block changed.
 */
export const blockLines = (document: unknown, labels: BlockLabels) => {
  const lines: string[] = [];
  const walk = (node: Node, prefix: string) => {
    const children = Array.isArray(node.content)
      ? (node.content as Node[])
      : [];
    switch (node.type) {
      case 'paragraph':
        lines.push(prefix + inline(node));
        return;
      case 'heading':
        lines.push(
          `${prefix}${'#'.repeat(Number(node.attrs?.level) || 2)} ${inline(node)}`,
        );
        return;
      case 'codeBlock':
        for (const line of inline(node).split('\n'))
          lines.push(`${prefix}    ${line}`);
        return;
      case 'tableRow':
        lines.push(`${prefix}| ${children.map(inline).join(' | ')} |`);
        return;
      case 'image':
        lines.push(
          `${prefix}[${labels.image}] ${String(node.attrs?.alt ?? '')}`.trimEnd(),
        );
        return;
      case 'audio':
        lines.push(`${prefix}[${labels.audio}]`);
        return;
      case 'embed':
        lines.push(
          `${prefix}[${labels.embed}] ${String(node.attrs?.url ?? '')}`,
        );
        return;
      case 'horizontalRule':
        lines.push(`${prefix}---`);
        return;
      case 'more':
        lines.push(`${prefix}<!--more-->`);
        return;
      case 'pageBreak':
        lines.push(`${prefix}<!--nextpage-->`);
        return;
      case 'patternRef':
        lines.push(
          `${prefix}[${labels.pattern}] ${String(node.attrs?.ref ?? '')}`,
        );
        return;
      case 'blockquote':
        for (const child of children) walk(child, `${prefix}> `);
        return;
      case 'bulletList':
      case 'orderedList':
        children.forEach((item, index) => {
          const marker = node.type === 'bulletList' ? '• ' : `${index + 1}. `;
          (Array.isArray(item.content) ? (item.content as Node[]) : []).forEach(
            (child, position) =>
              walk(child, prefix + (position ? '   ' : marker)),
          );
        });
        return;
      default:
        for (const child of children) walk(child, prefix);
    }
  };
  if (document && typeof document === 'object') walk(document as Node, '');
  return lines;
};
