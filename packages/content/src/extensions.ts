// The editor schema. The admin editor and the API renderer must use this exact list,
// so stored documents always render the way they were written.
import { Node, getSchema } from '@tiptap/core';
import { Image } from '@tiptap/extension-image';
import { TableKit } from '@tiptap/extension-table';
import { StarterKit } from '@tiptap/starter-kit';
import { safeHttpsUrl, safeImageSrc } from '#content/urls';
import type { ContentDocument } from '@cms/sdk';
import { Errors } from '#content/errors';

/** Images from the media library (`mediaId`) or `https:` URLs; unsafe sources render without `src`. */
const ContentImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      src: {
        default: null,
        renderHTML: (attributes) => ({ src: safeImageSrc(attributes.src) }),
      },
      height: { default: null },
      mediaId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-media-id'),
        renderHTML: (attributes) =>
          typeof attributes.mediaId === 'string'
            ? { 'data-media-id': attributes.mediaId }
            : {},
      },
    };
  },
}).configure({ inline: false, allowBase64: false });

/**
 * An embedded page (video, post) by URL. Stored and rendered as a plain link inside a marked
 * figure; the API swaps in the provider's player when it serves the content.
 */
export const Embed = Node.create({
  name: 'embed',
  group: 'block',
  atom: true,
  addAttributes() {
    return { url: { default: null } };
  },
  parseHTML() {
    return [
      {
        tag: 'figure[data-embed-url]',
        getAttrs: (element) => ({
          url: element.getAttribute('data-embed-url'),
        }),
      },
    ];
  },
  renderHTML({ node }) {
    const url = safeHttpsUrl(node.attrs.url) ?? '';
    return [
      'figure',
      { 'data-embed-url': url, class: 'embed' },
      ['a', { href: url, rel: 'noopener nofollow' }, url],
    ];
  },
});

/** Uploaded audio uses the same safe media URL and usage identifier as images. */
export const Audio = Node.create({
  name: 'audio',
  group: 'block',
  atom: true,
  addAttributes() {
    return {
      src: { default: null },
      mediaId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-media-id'),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'audio[src]' }];
  },
  renderHTML({ node }) {
    return [
      'audio',
      {
        src: safeImageSrc(node.attrs.src),
        controls: '',
        preload: 'metadata',
        ...(typeof node.attrs.mediaId === 'string'
          ? { 'data-media-id': node.attrs.mediaId }
          : {}),
      },
    ];
  },
});

export const contentExtensions = [
  StarterKit.configure({
    heading: { levels: [2, 3, 4] },
    link: { openOnClick: false, defaultProtocol: 'https' },
  }),
  ContentImage,
  Audio,
  TableKit.configure({ table: { resizable: false } }),
  Embed,
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
      cause instanceof Error ? cause.message : Errors.InvalidDocument,
      { cause },
    );
  }
};
