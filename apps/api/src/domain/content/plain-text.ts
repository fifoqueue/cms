import type { ContentDocument } from '@cms/sdk';

/** The document's text without markup, whitespace collapsed. Searched instead of the HTML. */
export const plainText = (document: ContentDocument): string => {
  const parts: string[] = [];
  const stack: { node: unknown; close: boolean }[] = [
    { node: document, close: false },
  ];

  for (let frame = stack.pop(); frame; frame = stack.pop()) {
    if (frame.close) {
      parts.push(' ');
      continue;
    }
    if (typeof frame.node !== 'object' || frame.node === null) continue;
    const { type, text, content } = frame.node as Record<string, unknown>;
    if (type === 'text') {
      if (typeof text === 'string') parts.push(text);
      continue;
    }
    if (!Array.isArray(content)) continue;
    parts.push(' ');
    stack.push({ node: null, close: true });
    for (let index = content.length - 1; index >= 0; index -= 1)
      stack.push({ node: content[index], close: false });
  }

  return parts.join('').replace(/\s+/g, ' ').trim();
};

/** The first `words` words of `text` (WordPress-style automatic excerpt), at most 300 characters. */
export const summarize = (text: string, words = 55): string => {
  const parts = text.split(' ').filter(Boolean);
  const head = parts.slice(0, words).join(' ');
  const clipped = head.length > 300 ? `${head.slice(0, 299).trimEnd()}…` : head;
  return parts.length > words && !clipped.endsWith('…')
    ? `${clipped}…`
    : clipped;
};

/** Ids of library media the document shows (`image`, `audio`, `video` and `file` nodes with a `mediaId`). */
export const mediaIdsOf = (document: ContentDocument): string[] => {
  const ids = new Set<string>();
  const stack: unknown[] = [document];

  while (stack.length) {
    const node = stack.pop();
    if (typeof node !== 'object' || node === null) continue;
    const { type, attrs, content } = node as Record<string, unknown>;
    const mediaId = (attrs as { mediaId?: unknown } | undefined)?.mediaId;
    if (
      ['image', 'audio', 'video', 'file'].includes(String(type)) &&
      typeof mediaId === 'string'
    )
      ids.add(mediaId);
    if (Array.isArray(content))
      for (let index = content.length - 1; index >= 0; index -= 1)
        stack.push(content[index]);
  }
  return [...ids];
};
