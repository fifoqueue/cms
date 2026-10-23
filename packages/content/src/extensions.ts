// The editor schema. The admin editor and the API renderer must use this exact list,
// so stored documents always render the way they were written.
import { Node, getSchema } from '@tiptap/core';
import { TableKit } from '@tiptap/extension-table';
import { StarterKit } from '@tiptap/starter-kit';
import { safeHttpsUrl, safeLinkHref } from '#content/urls';
import { contentDocumentSchema, contentAttributeSchemas } from '@cms/sdk';
import { Audio, ContentImage, Video, File, Gallery } from '#content/media';
import {
  TextAlignment,
  Columns,
  Column,
  Buttons,
  ButtonLink,
  Details,
  DetailsSummary,
  DetailsContent,
  Pullquote,
  Spacer,
  ContentTable,
} from '#content/blocks';
import type { ContentDocument } from '@cms/sdk';
import { Errors } from '#content/errors';

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

export const contentExtensions = [
  StarterKit.configure({
    heading: { levels: [2, 3, 4] },
    link: {
      openOnClick: false,
      defaultProtocol: 'https',
      isAllowedUri: (url) => safeLinkHref(url) !== null,
    },
    horizontalRule: { HTMLAttributes: { class: 'cms-separator' } },
  }),
  ContentImage,
  Audio,
  Video,
  File,
  Gallery,
  TextAlignment,
  Columns,
  Column,
  Buttons,
  ButtonLink,
  Details,
  DetailsSummary,
  DetailsContent,
  Pullquote,
  Spacer,
  TableKit.configure({ table: false }),
  ContentTable,
  Embed,
];

const schema = getSchema(contentExtensions);

export class InvalidDocumentError extends Error {
  override name = 'InvalidDocumentError';
}

/** Throws `InvalidDocumentError` unless the document conforms to the editor schema. */
export const parseDocument = (document: ContentDocument) => {
  try {
    if (!contentDocumentSchema.safeParse(document).success)
      throw new Error(Errors.InvalidDocument);
    const stack: Record<string, unknown>[] = [document];
    while (stack.length) {
      const raw = stack.pop()!;
      const type = typeof raw.type === 'string' ? raw.type : '';
      const spec = schema.nodes[type] ?? schema.marks[type];
      if (!spec) throw new Error(Errors.InvalidDocument);
      const attrs = raw.attrs ?? {};
      if (typeof attrs !== 'object' || attrs === null || Array.isArray(attrs))
        throw new Error(Errors.InvalidDocument);
      // Unknown attributes are dropped by the schema, as they always were; known ones must be valid.
      const known = Object.fromEntries(
        Object.entries(attrs).filter(([key]) =>
          Object.hasOwn(spec.spec.attrs ?? {}, key),
        ),
      );
      const validator =
        contentAttributeSchemas[type as keyof typeof contentAttributeSchemas];
      if (validator && !validator.safeParse(known).success)
        throw new Error(Errors.InvalidDocument);
      for (const child of [
        ...(Array.isArray(raw.content) ? raw.content : []),
        ...(Array.isArray(raw.marks) ? raw.marks : []),
      ]) {
        if (!child || typeof child !== 'object' || Array.isArray(child))
          throw new Error(Errors.InvalidDocument);
        stack.push(child as Record<string, unknown>);
      }
    }
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
