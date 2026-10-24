import { describe, expect, test } from 'bun:test';
import { getSchema } from '@tiptap/core';
import type { JSONContent } from '@tiptap/core';
import { generateJSON } from '@tiptap/html/server';
import { renderToHTMLString } from '@tiptap/static-renderer/pm/html-string';
import { contentExtensions as extensions } from '#content/extensions';

const schema = getSchema(extensions);

const text = (value: string, marks?: JSONContent['marks']) => ({
  type: 'text',
  text: value,
  ...(marks && { marks }),
});
const paragraph = (...content: JSONContent[]) => ({
  type: 'paragraph',
  attrs: { textAlign: null },
  content,
});
const doc = (...content: JSONContent[]) => ({ type: 'doc', content });
const render = (json: JSONContent) =>
  renderToHTMLString({ extensions, content: schema.nodeFromJSON(json) });

const rich = doc({
  type: 'callout',
  attrs: { variant: 'warning', dismissible: true },
  content: [
    {
      type: 'heading',
      attrs: { level: 3, textAlign: null, anchor: null },
      content: [text('Heads up')],
    },
    paragraph(
      text('Read '),
      text('this', [{ type: 'bold' }]),
      text(' first', [
        {
          type: 'link',
          attrs: {
            href: '/guide',
            target: '_blank',
            rel: 'noopener noreferrer nofollow',
            class: null,
            title: null,
          },
        },
      ]),
    ),
    {
      type: 'bulletList',
      content: [{ type: 'listItem', content: [paragraph(text('One'))] }],
    },
    {
      type: 'callout',
      attrs: { variant: 'dark', dismissible: false },
      content: [paragraph(text('Nested'))],
    },
  ],
});

describe('callout', () => {
  test('JSON round-trips with nested rich text, and defaults to a lasting info box', () => {
    const node = schema.nodeFromJSON(rich);
    node.check();
    expect(node.toJSON()).toEqual(rich);
    expect(
      schema
        .nodeFromJSON(doc({ type: 'callout', content: [paragraph()] }))
        .toJSON().content[0].attrs,
    ).toEqual({ variant: 'info', dismissible: false });
  });

  test('holds blocks only, at least one', () => {
    for (const content of [[], [text('bare')]])
      expect(() =>
        schema.nodeFromJSON(doc({ type: 'callout', content })).check(),
      ).toThrow();
  });

  test('renders a labelled note with an icon and a hidden close button when dismissible', () => {
    expect(
      render(
        doc({
          type: 'callout',
          attrs: { variant: 'danger', dismissible: true },
          content: [paragraph(text('Careful'))],
        }),
      ),
    ).toBe(
      '<aside class="cms-callout cms-callout-danger" role="note" data-dismissible="true"><span class="cms-callout-icon" aria-hidden="true"></span><div class="cms-callout-body"><p>Careful</p></div><button type="button" class="cms-callout-close" hidden=""><span aria-hidden="true">×</span></button></aside>',
    );
    expect(
      render(doc({ type: 'callout', content: [paragraph(text('Note'))] })),
    ).toBe(
      '<aside class="cms-callout cms-callout-info" role="note"><span class="cms-callout-icon" aria-hidden="true"></span><div class="cms-callout-body"><p>Note</p></div></aside>',
    );
  });

  test('rendered HTML parses back to the same document', () => {
    expect(generateJSON(render(rich), extensions)).toEqual(rich);
  });

  test('pasted HTML keeps only known variants and no decoration as content', () => {
    expect(
      generateJSON(
        '<aside class="cms-callout cms-callout-purple" data-dismissible="false"><span class="cms-callout-icon"></span><p>Hi</p><button class="cms-callout-close"><span>×</span></button></aside>',
        extensions,
      ),
    ).toEqual(
      doc({
        type: 'callout',
        attrs: { variant: 'info', dismissible: false },
        content: [paragraph(text('Hi'))],
      }),
    );
    expect(
      render(
        doc({
          type: 'callout',
          attrs: { variant: 'x" onclick="y' },
          content: [paragraph(text('Hi'))],
        }),
      ),
    ).toContain('class="cms-callout cms-callout-info"');
  });
});
