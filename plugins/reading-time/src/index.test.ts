import { expect, test } from 'bun:test';
import { escapeHtml, readingMinutes } from './index';

test('estimates at least one minute from visible words', () => {
  expect(readingMinutes('<p>hello <strong>world</strong></p>', 200)).toBe(1);
  expect(readingMinutes(`<p>${'word '.repeat(1000)}</p>`, 200)).toBe(5);
  expect(readingMinutes('<p>안녕하세요 반갑습니다</p>'.repeat(300), 200)).toBe(
    3,
  );
});

test('escapes label text', () => {
  expect(escapeHtml('<b>"x"</b>')).toBe('&#60;b&#62;&#34;x&#34;&#60;/b&#62;');
});
