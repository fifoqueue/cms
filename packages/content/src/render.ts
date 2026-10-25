import type { ContentDocument } from '@cms/sdk';
import { contentExtensions, parseDocument } from '#content/extensions';
import { codeBlockNodeMapping } from '#content/code-render';
import { renderWithToc } from '#content/toc';
import type { AutoTocOptions } from '#content/toc';

/** Validates a document against the editor schema and renders it to HTML without a DOM. */
export const renderDocument = (
  document: ContentDocument,
  autoToc?: AutoTocOptions,
): string =>
  renderWithToc(
    parseDocument(document),
    contentExtensions,
    {
      nodeMapping: codeBlockNodeMapping,
    },
    autoToc,
  );
