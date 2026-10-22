import { renderToHTMLString } from '@tiptap/static-renderer/pm/html-string';
import type { ContentDocument } from '@cms/sdk';
import { contentExtensions, parseDocument } from '#content/extensions';

/** Validates a document against the editor schema and renders it to HTML without a DOM. */
export const renderDocument = (document: ContentDocument): string =>
  renderToHTMLString({
    extensions: contentExtensions,
    content: parseDocument(document),
  });
