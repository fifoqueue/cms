import { expect, test } from 'bun:test';
import { renderCodeBlock } from '#content/code-render';

test('malicious text, labels and language classes are escaped', () => {
  const html = renderCodeBlock('<script>alert(1)</script>', {
    label: '<img onerror=x>',
  });
  expect(html).not.toContain('<script>');
  expect(html).not.toContain('<img');
  expect(renderCodeBlock('x', { language: 'a"b' })).toContain(
    'class="language-a&quot;b"',
  );
});
