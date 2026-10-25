import { expect, test } from 'bun:test';
import { getSchema } from '@tiptap/core';
import { renderToHTMLString } from '@tiptap/static-renderer/pm/html-string';
import { contentExtensions as extensions } from '#content/extensions';

const schema = getSchema(extensions);

test('callout variants outside the allowlist cannot inject attributes', () => {
  expect(
    renderToHTMLString({
      extensions,
      content: schema.nodeFromJSON({
        type: 'doc',
        content: [
          {
            type: 'callout',
            attrs: { variant: 'x" onclick="y' },
            content: [
              { type: 'paragraph', content: [{ type: 'text', text: 'Hi' }] },
            ],
          },
        ],
      }),
    }),
  ).toContain('class="cms-callout cms-callout-info"');
});
