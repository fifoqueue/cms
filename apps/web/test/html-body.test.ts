import { expect, test } from 'bun:test';
import {
  HtmlBody,
  decodeHtml,
  encodeHtml,
  renderHtml,
} from '#lib/theme/html-body.js';

test('body transport references SSR markup but sends complete text for navigation and unrendered templates', () => {
  const html = '<p>A &amp; B <a href="/next">next</a></p>';
  const body = new HtmlBody(html, 'entry:1');

  expect(encodeHtml(body)).toEqual(['entry:1', html]);
  expect(renderHtml(body)).toBe(html);
  expect(encodeHtml(body)).toEqual(['entry:1', null]);
  const root = {
    querySelectorAll: () => [
      { getAttribute: () => 'entry:1', innerHTML: html },
    ],
  } as unknown as Pick<Document, 'querySelectorAll'>;
  const restored = decodeHtml(['entry:1', null], root);

  expect(renderHtml(restored)).toBe(html);
  expect(renderHtml(decodeHtml(['entry:2', '<p>Next page</p>']))).toBe(
    '<p>Next page</p>',
  );
  expect(encodeHtml(new HtmlBody(html, 'not-rendered'))).toEqual([
    'not-rendered',
    html,
  ]);
});
