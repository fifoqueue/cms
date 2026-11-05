import { expect, test } from 'bun:test';
import { linkMarkAttributes } from '@cms/content/link';
import { renderDocument } from '@cms/content/render';
import type { ContentDocument } from '@cms/sdk';
import { withoutLinkDefaults } from '#api/infra/prisma/link-defaults';

const link = (attrs: Record<string, unknown>) => ({
  type: 'text',
  text: 'x',
  marks: [{ type: 'bold' }, { type: 'link', attrs: { href: '/a', ...attrs } }],
});

test('the link migration clears only injected defaults and is idempotent', () => {
  const chosen = linkMarkAttributes({ newTab: true, rel: ['nofollow'] });
  const document: ContentDocument = {
    type: 'doc',
    content: [
      {
        type: 'blockquote',
        content: [
          {
            type: 'paragraph',
            content: [
              link({ target: '_blank', rel: 'noopener noreferrer nofollow' }),
              link(chosen),
              link({ target: '_blank', rel: 'noopener' }),
            ],
          },
        ],
      },
    ],
  };
  const before = JSON.stringify(document);
  const migrated = withoutLinkDefaults(document)!;

  expect(JSON.stringify(document)).toBe(before);
  expect(renderDocument(migrated)).toBe(
    '<blockquote><p><a href="/a"><strong>x</strong></a>' +
      '<a href="/a" target="_blank" rel="noopener noreferrer nofollow"><strong>x</strong></a>' +
      '<a href="/a" target="_blank" rel="noopener noreferrer"><strong>x</strong></a></p></blockquote>',
  );
  expect(withoutLinkDefaults(migrated)).toBeNull();
});
