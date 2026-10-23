import { expect, test } from 'bun:test';
import { blockLines, lineDiff, sideBySide } from '#lib/admin/diff.js';

const labels = {
  image: 'Image',
  audio: 'Audio',
  embed: 'Embed',
  pattern: 'Pattern',
};
const text = (value: string) => ({ type: 'text', text: value });

test('revisions compare readable blocks side by side', () => {
  const before = blockLines(
    {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [text('Intro')] },
        { type: 'paragraph', content: [text('Old line')] },
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [text('one')] }],
            },
          ],
        },
      ],
    },
    labels,
  );
  expect(before).toEqual(['## Intro', 'Old line', '• one']);
  const after = ['## Intro', 'New line', '[Image] A cat', '• one'];
  expect(sideBySide(lineDiff(before, after))).toEqual([
    { before: '## Intro', after: '## Intro', changed: false },
    { before: 'Old line', after: 'New line', changed: true },
    { before: undefined, after: '[Image] A cat', changed: true },
    { before: '• one', after: '• one', changed: false },
  ]);
});
