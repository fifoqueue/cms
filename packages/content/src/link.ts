import {
  linkHtmlAttributes,
  linkRels,
  linkRelValue,
  opensNewTab,
} from '@cms/sdk';
import type { LinkSettings } from '@cms/sdk';
import { Link } from '@tiptap/extension-link';
import { safeLinkHref } from '#content/urls';

// The model lives in the SDK so theme blocks and menus share it without loading Tiptap.
export {
  LINK_RELS,
  linkHtmlAttributes,
  linkRels,
  linkRelValue,
  opensNewTab,
} from '@cms/sdk';
export type { LinkRel, LinkSettings } from '@cms/sdk';

/** Link mark attributes as stored: `target` is `_blank` or null, `rel` holds only `LINK_RELS`. */
export const linkMarkAttributes = ({ newTab, rel }: LinkSettings) => ({
  target: newTab ? '_blank' : null,
  rel: linkRelValue(rel),
});

/** The settings of stored link mark attributes, whatever text they hold. */
export const linkMarkSettings = (attrs: {
  target?: unknown;
  rel?: unknown;
}): LinkSettings => ({
  newTab: opensNewTab(attrs.target),
  rel: linkRels(attrs.rel),
});

/**
 * The link mark. Imported HTML keeps only the `target`/`rel` it states (normalized); nothing is
 * stored or rendered by default.
 */
export const ContentLink = Link.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      target: {
        default: null,
        rendered: false,
        parseHTML: (element) =>
          opensNewTab(element.getAttribute('target')) ? '_blank' : null,
      },
      rel: {
        default: null,
        rendered: false,
        parseHTML: (element) => linkRelValue(element.getAttribute('rel')),
      },
    };
  },
  renderHTML({ mark, HTMLAttributes }) {
    return [
      'a',
      {
        ...HTMLAttributes,
        href: safeLinkHref(HTMLAttributes.href) ?? '',
        ...linkHtmlAttributes(linkMarkSettings(mark.attrs)),
      },
      0,
    ];
  },
}).configure({
  openOnClick: false,
  defaultProtocol: 'https',
  isAllowedUri: (url) => safeLinkHref(url) !== null,
  HTMLAttributes: {},
});
