// The editor schema. The admin editor and the API renderer must use this exact list,
// so stored documents always render the way they were written.
import { getSchema } from '@tiptap/core';
import { StarterKit } from '@tiptap/starter-kit';
import type { ContentDocument } from '@cms/sdk';

export const contentExtensions = [
  StarterKit.configure({
    heading: { levels: [2, 3, 4] },
    link: { openOnClick: false, defaultProtocol: 'https' },
  }),
];

const schema = getSchema(contentExtensions);

export class InvalidDocumentError extends Error {
  override name = 'InvalidDocumentError';
}

/** Throws `InvalidDocumentError` unless the document conforms to the editor schema. */
export const parseDocument = (document: ContentDocument) => {
  try {
    const node = schema.nodeFromJSON(document);
    node.check();
    return node;
  } catch (cause) {
    throw new InvalidDocumentError(
      cause instanceof Error ? cause.message : 'Invalid document',
      { cause },
    );
  }
};
