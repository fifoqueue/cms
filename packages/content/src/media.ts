import { Node } from '@tiptap/core';
import { Image } from '@tiptap/extension-image';
import type { DOMOutputSpec, Schema } from '@tiptap/pm/model';
import { Fragment } from '@tiptap/pm/model';
import { Errors } from '#content/errors';
import { safeImageSrc, safeLinkHref } from '#content/urls';

const imageOf = (element: HTMLElement) =>
  element.matches('img') ? element : element.querySelector('img');
const number = (value: string | null) =>
  value && /^\d+$/.test(value) ? Number(value) : null;
const captionOf = (element: HTMLElement) =>
  element.querySelector(':scope > figcaption')?.textContent ?? '';
export const alignmentOf = (element: HTMLElement) =>
  /(?:^|\s)(?:align|cms-align-)(left|center|right|wide|full)(?:\s|$)/.exec(
    element.className,
  )?.[1] ?? 'center';

/** Explicit projection also handles WordPress figures without treating their numeric IDs as local media IDs. */
export const imageAttributes = (element: HTMLElement) => {
  const image = imageOf(element);
  const link = element.querySelector('a');
  return {
    src: safeImageSrc(image?.getAttribute('src')),
    alt: image?.getAttribute('alt') ?? '',
    title: image?.getAttribute('title'),
    width: number(image?.getAttribute('width') ?? null),
    height: number(image?.getAttribute('height') ?? null),
    mediaId: image?.getAttribute('data-media-id'),
    caption: captionOf(element),
    align: alignmentOf(element),
    href: safeLinkHref(link?.getAttribute('href')),
    newTab: link?.getAttribute('target') === '_blank',
  };
};

export const ContentImage = Image.extend({
  addAttributes() {
    const defaults = {
      src: null,
      alt: null,
      title: null,
      width: null,
      height: null,
      mediaId: null,
      caption: '',
      align: 'center',
      href: null,
      newTab: false,
    };
    return Object.fromEntries(
      Object.entries(defaults).map(([key, value]) => [
        key,
        {
          default: value,
          rendered: false,
          parseHTML: (element: HTMLElement) =>
            imageAttributes(element)[
              key as keyof ReturnType<typeof imageAttributes>
            ],
        },
      ]),
    );
  },
  parseHTML() {
    return [
      { tag: 'figure.wp-block-image', priority: 60 },
      { tag: 'figure.cms-image', priority: 60 },
      { tag: 'img[src]' },
    ];
  },
  renderHTML({ node }) {
    const a = node.attrs;
    const image: DOMOutputSpec = [
      'img',
      {
        src: safeImageSrc(a.src),
        alt: a.alt ?? '',
        title: a.title,
        width: a.width,
        height: a.height,
        // Loading hints and srcset are added when the API serves the content (responsive images).
        'data-media-id': a.mediaId,
      },
    ];
    const href = safeLinkHref(a.href);
    const visual: DOMOutputSpec = href
      ? [
          'a',
          {
            href,
            ...(a.newTab && { target: '_blank', rel: 'noopener noreferrer' }),
          },
          image,
        ]
      : image;
    return [
      'figure',
      { class: `cms-image cms-align-${a.align}` },
      visual,
      ...(a.caption ? [['figcaption', {}, a.caption] as DOMOutputSpec] : []),
    ];
  },
}).configure({ inline: false, allowBase64: false });

const mediaAttributes = {
  src: { default: null },
  mediaId: {
    default: null,
    parseHTML: (element: HTMLElement) => element.getAttribute('data-media-id'),
  },
};

export const Audio = Node.create({
  name: 'audio',
  group: 'block',
  atom: true,
  addAttributes: () => mediaAttributes,
  parseHTML: () => [{ tag: 'audio[src]' }],
  renderHTML: ({ node }) => [
    'audio',
    {
      src: safeImageSrc(node.attrs.src),
      'data-media-id': node.attrs.mediaId,
      controls: '',
      preload: 'metadata',
    },
  ],
});

const videoOf = (element: HTMLElement) =>
  element.matches('video') ? element : element.querySelector('video');

export const Video = Node.create({
  name: 'video',
  group: 'block',
  atom: true,
  addAttributes() {
    return {
      src: {
        default: null,
        parseHTML: (element) =>
          safeImageSrc(
            videoOf(element)?.getAttribute('src') ??
              videoOf(element)?.querySelector('source')?.getAttribute('src'),
          ),
      },
      mediaId: {
        default: null,
        parseHTML: (element) => videoOf(element)?.getAttribute('data-media-id'),
      },
      caption: { default: '', parseHTML: captionOf },
      poster: {
        default: null,
        parseHTML: (element) =>
          safeImageSrc(videoOf(element)?.getAttribute('poster')),
      },
      loop: {
        default: false,
        parseHTML: (element) => videoOf(element)?.hasAttribute('loop') ?? false,
      },
      muted: {
        default: false,
        parseHTML: (element) =>
          videoOf(element)?.hasAttribute('muted') ?? false,
      },
    };
  },
  parseHTML: () => [
    { tag: 'figure.wp-block-video', priority: 60 },
    { tag: 'figure.cms-video', priority: 60 },
    { tag: 'video' },
  ],
  renderHTML({ node }) {
    const a = node.attrs;
    return [
      'figure',
      { class: 'cms-video' },
      [
        'video',
        {
          src: safeImageSrc(a.src),
          poster: safeImageSrc(a.poster),
          'data-media-id': a.mediaId,
          controls: '',
          preload: 'metadata',
          playsinline: '',
          ...(a.loop && { loop: '' }),
          ...(a.muted && { muted: '' }),
        },
      ],
      ...(a.caption ? [['figcaption', {}, a.caption] as DOMOutputSpec] : []),
    ];
  },
});

const fileOf = (element: HTMLElement) =>
  element.matches('a') ? element : element.querySelector('a[href]');

export const File = Node.create({
  name: 'file',
  group: 'block',
  atom: true,
  addAttributes() {
    return {
      src: {
        default: null,
        parseHTML: (element) =>
          safeImageSrc(fileOf(element)?.getAttribute('href')),
      },
      mediaId: {
        default: null,
        parseHTML: (element) => fileOf(element)?.getAttribute('data-media-id'),
      },
      name: {
        default: '',
        parseHTML: (element) => fileOf(element)?.textContent ?? '',
      },
      download: {
        default: true,
        parseHTML: (element) =>
          !!element.querySelector('a[download]') ||
          element.hasAttribute('download'),
      },
    };
  },
  parseHTML: () => [
    { tag: 'div.wp-block-file', priority: 60 },
    { tag: 'div.cms-file', priority: 60 },
    { tag: 'a[download]', priority: 60 },
  ],
  renderHTML({ node }) {
    const a = node.attrs;
    return [
      'div',
      { class: 'cms-file' },
      [
        'a',
        {
          href: safeImageSrc(a.src),
          'data-media-id': a.mediaId,
          ...(a.download && { download: '' }),
        },
        a.name || a.src || '',
      ],
    ];
  },
});

export const Gallery = Node.create({
  name: 'gallery',
  group: 'block',
  content: 'image{1,100}',
  isolating: true,
  addAttributes() {
    return {
      columns: {
        default: 3,
        parseHTML: (element) =>
          number(element.getAttribute('data-columns')) ??
          Number(
            /(?:^|\s)columns-(\d)(?:\s|$)/.exec(element.className)?.[1] ?? 3,
          ),
      },
      crop: {
        default: true,
        parseHTML: (element) =>
          element.classList.contains('is-cropped') ||
          element.getAttribute('data-crop') === 'true',
      },
      caption: { default: '', parseHTML: captionOf },
      align: { default: 'center', parseHTML: alignmentOf },
    };
  },
  parseHTML() {
    return [
      { tag: 'figure.cms-gallery' },
      { tag: 'figure.wp-block-gallery' },
      { tag: 'ul.wp-block-gallery' },
    ].map((rule) => ({
      ...rule,
      priority: 70,
      getContent: (dom: globalThis.Node, schema: Schema) => {
        const element = dom as HTMLElement;
        const images = Array.from(element.querySelectorAll('img'));
        if (images.length > 100) throw new Error(Errors.InvalidDocument);
        return Fragment.fromArray(
          images.map((image) =>
            schema.nodes.image!.create(
              imageAttributes(
                image.closest(
                  'figure:not(.wp-block-gallery):not(.cms-gallery)',
                ) ?? image,
              ),
            ),
          ),
        );
      },
    }));
  },
  renderHTML({ node }) {
    const a = node.attrs;
    return [
      'figure',
      {
        class: `cms-gallery cms-align-${a.align}`,
        'data-columns': a.columns,
        'data-crop': String(a.crop),
        style: `--cms-gallery-columns:${a.columns}`,
      },
      ['div', { class: 'cms-gallery-grid' }, 0],
      ...(a.caption ? [['figcaption', {}, a.caption] as DOMOutputSpec] : []),
    ];
  },
});
