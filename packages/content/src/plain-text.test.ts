import { expect, test } from 'bun:test';
import type { ContentDocument } from '@cms/sdk';
import { keywordParagraph } from '#content/plain-text';

const paragraph = (text: string) => ({
  type: 'paragraph',
  content: [{ type: 'text', text }],
});
const doc = (...content: object[]) =>
  ({ type: 'doc', content }) as ContentDocument;

test('keywordParagraph returns the whole first paragraph containing the keyword', () => {
  const document = doc(
    paragraph('키워드 없는 첫 문단.'),
    {
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: '사과 이야기' }],
    },
    {
      type: 'blockquote',
      content: [
        paragraph('Apple Inc. 는 미국의 기업이다. 유래는 과일 "사과"가 맞다.'),
      ],
    },
    paragraph('사과는 맛있다.'),
  );

  expect(keywordParagraph(document, ' 사과 ')).toBe(
    'Apple Inc. 는 미국의 기업이다. 유래는 과일 "사과"가 맞다.',
  );
  expect(keywordParagraph(doc(paragraph('An APPLE a day')), 'apple')).toBe(
    'An APPLE a day',
  );
  expect(keywordParagraph(document, '배')).toBe('');
  expect(keywordParagraph(document, '  ')).toBe('');
  expect(
    keywordParagraph(doc(paragraph(`사과 ${'가'.repeat(400)}`)), '사과'),
  ).toHaveLength(300);
});
