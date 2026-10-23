import { expect, test } from 'bun:test';
import { richText } from '#api/domain/appearance/rich-text';

test('widget text keeps bold, italic and checked links, and never produces markup', () => {
  const paragraphs = richText(
    'Hi **there** and *you*.\n\n[Docs](/docs) [x](javascript:alert(1)) <script>alert(1)</script> [mail](mailto:a@b.test)',
  );
  expect(paragraphs).toHaveLength(2);
  expect(paragraphs[0]).toEqual([
    { text: 'Hi ', strong: false, em: false, href: null },
    { text: 'there', strong: true, em: false, href: null },
    { text: ' and ', strong: false, em: false, href: null },
    { text: 'you', strong: false, em: true, href: null },
    { text: '.', strong: false, em: false, href: null },
  ]);
  const links = paragraphs[1]!.filter((run) => run.href);
  expect(links.map((run) => run.href)).toEqual(['/docs', 'mailto:a@b.test']);
  // Unsafe links and tags stay literal text, which themes render escaped.
  expect(paragraphs[1]!.map((run) => run.text).join('')).toContain(
    '[x](javascript:alert(1)) <script>',
  );
});
