import {
  collectFootnotes,
  FOOTNOTE_MAX_LENGTH,
  isFootnoteName,
} from '@cms/sdk/footnotes';
import type { FootnoteGroup, FootnoteSource } from '@cms/sdk/footnotes';
import type { JSONContent } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';

/**
 * A footnote's note as the API accepts it: text trimmed and at most 2000 characters, and a
 * name only when it is one the `[*name]` shortcut accepts. A named note may have no text of
 * its own (it reuses the note its name defines); null for a blank numbered note, which is
 * never kept.
 */
export const footnoteSource = (
  attrs: Record<string, unknown> | undefined,
): FootnoteSource | null => {
  const text =
    typeof attrs?.text === 'string'
      ? attrs.text.trim().slice(0, FOOTNOTE_MAX_LENGTH)
      : '';
  const name = typeof attrs?.name === 'string' ? attrs.name : '';
  if (isFootnoteName(name)) return { name, text };
  return text ? { text } : null;
};

/**
 * The document as it may be published (form value, autosave): footnote texts valid, named
 * references kept even without text, and blank numbered footnotes left out — including one
 * whose field is still open, which the live editor keeps. An open field's unsaved text is not
 * part of it; the last stored text is.
 */
export const publishedDocument = <T extends JSONContent>(document: T): T => {
  const clean = (node: JSONContent): JSONContent | null => {
    if (node.type === 'footnote') {
      const source = footnoteSource(node.attrs);
      return source
        ? { ...node, attrs: { ...node.attrs, text: source.text } }
        : null;
    }
    if (!node.content) return node;
    return {
      ...node,
      content: node.content
        .map(clean)
        .filter((child): child is JSONContent => child !== null),
    };
  };
  return clean(document) as T;
};

export interface FootnotePages {
  /** Each page's notes (1-based page number), in the order the published list shows them. */
  pages: { page: number; notes: FootnoteGroup[] }[];
  /** The note each footnote, by position, shows: its label and resolved text. */
  notes: Map<number, FootnoteGroup>;
}

const cache = new WeakMap<ProseMirrorNode, FootnotePages>();

/**
 * Footnotes grouped as the renderer groups them: in document order, labels starting again
 * after each top-level page break, with same-name references sharing one note whose text is
 * always the name's first nonempty definition in the whole document. Computed once per document
 * for every footnote view and the preview.
 */
export const footnotePages = (doc: ProseMirrorNode): FootnotePages => {
  const cached = cache.get(doc);
  if (cached) return cached;
  const result: FootnotePages = { pages: [], notes: new Map() };
  const bodies = new Map<string, string>();
  doc.descendants((node) => {
    if (node.type.name !== 'footnote') return;
    const source = footnoteSource(node.attrs);
    if (source?.name !== undefined && source.text && !bodies.has(source.name))
      bodies.set(source.name, source.text);
  });
  let page = 1;
  let positions: number[] = [];
  let sources: FootnoteSource[] = [];
  const flush = () => {
    // A name's first definition in the document wins over any later page's own text.
    const notes = collectFootnotes(sources).map((note) => {
      const name = sources[note.references[0]!]!.name;
      const body = name === undefined ? undefined : bodies.get(name);
      return body === undefined ? note : { ...note, text: body };
    });
    for (const note of notes)
      for (const index of note.references)
        result.notes.set(positions[index]!, note);
    if (notes.length) result.pages.push({ page, notes });
    positions = [];
    sources = [];
  };
  doc.descendants((node, pos, parent) => {
    if (parent === doc && node.type.name === 'pageBreak') {
      flush();
      page++;
    } else if (node.type.name === 'footnote') {
      positions.push(pos);
      // A new note whose field is open stays numbered while it is still blank.
      sources.push(footnoteSource(node.attrs) ?? { text: '' });
    }
  });
  flush();
  cache.set(doc, result);
  return result;
};
