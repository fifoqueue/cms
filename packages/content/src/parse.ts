// Server-only: converts HTML to an editor document with the shared schema. Never import this
// from browser code (it loads a DOM implementation).
import { generateJSON } from '@tiptap/html/server';
import type { ContentDocument } from '@cms/sdk';
import { contentExtensions } from '#content/extensions';

const BLOCK = /<(p|div|h[1-6]|ul|ol|blockquote|pre|figure|table|hr)\b/i;

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

/** An editor document from HTML; markup the schema does not know is dropped, text is kept. */
export const parseHtml = (html: string): ContentDocument =>
  generateJSON(paragraphs(html), contentExtensions) as ContentDocument;
