// Shared by the content schema, the editor shortcuts and the renderer, so a note's name and
// grouping mean the same thing wherever a document is read or written.

/** A footnote reference; a named one without text reuses the note its name defines elsewhere. */
export interface FootnoteSource {
  name?: string;
  text: string;
}

/** One listed note. References are zero-based indexes into the sources, in document order. */
export interface FootnoteGroup {
  label: string;
  text: string;
  references: number[];
}

export const FOOTNOTE_MAX_LENGTH = 2000;
const reserved = /[[\]\n\r]/u;
const namePattern = /^[^\s[\]]+$/u;

/** A name the `[*name …]` shortcut can produce: nonblank, without whitespace or brackets. */
export const isFootnoteName = (name: string): boolean =>
  name.length <= FOOTNOTE_MAX_LENGTH && namePattern.test(name);

/** `[* text]` is anonymous, `[*name text]` defines a named note, `[*name]` reuses it. */
export const parseFootnote = (source: string): FootnoteSource | null => {
  if (!source.startsWith('[*') || !source.endsWith(']')) return null;

  const inner = source.slice(2, -1);
  if (reserved.test(inner)) return null;

  let gap = 0;
  while (gap < inner.length && inner[gap]!.trim() !== '') gap += 1;

  const name = inner.slice(0, gap);
  const text = inner.slice(gap).trim();
  if (name.length > FOOTNOTE_MAX_LENGTH || text.length > FOOTNOTE_MAX_LENGTH)
    return null;
  if (name === '') return text === '' ? null : { text };

  return { name, text };
};

/**
 * Names group references; equal anonymous texts stay separate notes. An empty name (the
 * node's default) is anonymous. Groups follow their first reference; a named group takes its
 * first nonempty text, wherever it appears.
 */
export const collectFootnotes = (
  sources: readonly FootnoteSource[],
): FootnoteGroup[] => {
  const groups: FootnoteGroup[] = [];
  const named = new Map<string, FootnoteGroup>();

  for (const [index, { name, text }] of sources.entries()) {
    let group = name ? named.get(name) : undefined;

    if (group === undefined) {
      group = {
        label: name || String(groups.length + 1),
        text,
        references: [],
      };
      groups.push(group);
      if (name) named.set(name, group);
    }
    if (group.text === '') group.text = text;
    group.references.push(index);
  }

  return groups;
};
