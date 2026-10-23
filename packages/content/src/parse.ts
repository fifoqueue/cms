// Server-only: converts HTML to an editor document with the shared schema. Never import this
// from browser code (it loads a DOM implementation).
import type { JSONContent } from '@tiptap/core';
import { generateJSON } from '@tiptap/html/server';
import { contentAttributeSchemas } from '@cms/sdk';
import type { ContentDocument } from '@cms/sdk';
import {
  contentExtensions,
  parseDocument,
  InvalidDocumentError,
} from '#content/extensions';

import { Errors } from '#content/errors';

const BLOCK =
  /<(p|div|h[1-6]|ul|ol|blockquote|pre|figure|table|hr|details|video|audio)\b/i;

/** WordPress stores classic posts with blank lines instead of paragraph tags ("autop"). */
const paragraphs = (html: string) =>
  BLOCK.test(html)
    ? html
    : html
        .split(/\n\s*\n/)
        .map((block) => block.trim())
        .filter(Boolean)
        .map((block) => `<p>${block.replace(/\n/g, '<br>')}</p>`)
        .join('');

/** Imported values the schema bounds (seven gallery columns, an 800px spacer) fall back to defaults. */
const withinBounds = (document: JSONContent) => {
  const stack = [document];
  while (stack.length) {
    const node = stack.pop()!;
    const validator =
      contentAttributeSchemas[
        node.type as keyof typeof contentAttributeSchemas
      ];
    const result = node.attrs && validator?.safeParse(node.attrs);
    if (result && !result.success)
      for (const { path } of result.error.issues)
        if (typeof path[0] === 'string') delete node.attrs![path[0]];
    stack.push(...(node.content ?? []), ...(node.marks ?? []));
  }
  return document as ContentDocument;
};

/** An editor document from HTML; markup the schema does not know is dropped, text is kept. */
export const parseHtml = (html: string): ContentDocument => {
  try {
    return parseDocument(
      withinBounds(generateJSON(paragraphs(html), contentExtensions)),
    ).toJSON() as ContentDocument;
  } catch (cause) {
    if (cause instanceof InvalidDocumentError) throw cause;
    throw new InvalidDocumentError(Errors.InvalidDocument, { cause });
  }
};
