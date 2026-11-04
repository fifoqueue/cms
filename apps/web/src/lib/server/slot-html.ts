import { parseFragment, serialize } from 'parse5';
import type { DefaultTreeAdapterMap } from 'parse5';
import type { SlotName } from '@cms/sdk';
import { webHeadMetaSchema } from '@cms/sdk/functions';

const BODY_TAGS = new Set(
  'a abbr b blockquote br code div em figcaption figure h1 h2 h3 h4 h5 h6 hr i img li ol p pre section small span strong sub sup table tbody td th thead tr ul'.split(
    ' ',
  ),
);
const ATTRS = new Set(
  'id class title lang dir role aria-label aria-hidden href src alt width height rel name property content'.split(
    ' ',
  ),
);

const safeUrl = (value: string) => {
  try {
    const url = new URL(value, 'https://slot.invalid');

    return (
      ['http:', 'https:'].includes(url.protocol) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
};

/** Slot markup cannot execute scripts, submit forms, embed documents or set policy. */
export const sanitizeSlot = (html: unknown, slot: SlotName): string => {
  if (typeof html !== 'string' || html.length > 262144) return '';
  const root = parseFragment(html);
  const tags = slot === 'head' ? new Set(['meta', 'link']) : BODY_TAGS;
  const clean = (parent: DefaultTreeAdapterMap['parentNode']) => {
    parent.childNodes = parent.childNodes.filter((node) => {
      if (node.nodeName === '#text') return slot !== 'head';
      if (!('tagName' in node) || !tags.has(node.tagName)) return false;

      if (node.tagName === 'meta') {
        if (node.attrs.some(({ name }) => name === 'http-equiv')) return false;
        const metadata = Object.fromEntries(
          node.attrs
            .filter(({ name }) =>
              ['name', 'property', 'content'].includes(name),
            )
            .map(({ name, value }) => [name, value]),
        );

        if (!webHeadMetaSchema.safeParse(metadata).success) return false;
      }

      node.attrs = node.attrs.filter(
        ({ name, value, namespace }) =>
          !namespace &&
          ATTRS.has(name) &&
          (!['href', 'src'].includes(name) || safeUrl(value)),
      );

      if (
        node.tagName === 'link' &&
        !node.attrs.some(
          (attr) =>
            attr.name === 'rel' &&
            ['canonical', 'alternate', 'author', 'license', 'help'].includes(
              attr.value,
            ),
        )
      )
        return false;
      clean(node);

      return true;
    });
  };

  clean(root);

  return serialize(root);
};
