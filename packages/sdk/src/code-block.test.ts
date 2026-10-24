import { describe, expect, test } from 'bun:test';
import {
  CODE_THEMES,
  codeBlockAttributesSchema,
  highlightedRows,
  highlightLinesSchema,
  shikiThemeId,
} from '#sdk/code-block';

describe('code block rendering helpers', () => {
  test('Material themes map to Shiki ids; other names pass through', () => {
    expect(shikiThemeId('material-default')).toBe('material-theme');
    expect(shikiThemeId('material-darker')).toBe('material-theme-darker');
    expect(shikiThemeId('material-palenight')).toBe('material-theme-palenight');
    expect(shikiThemeId('github-dark')).toBe('github-dark');
    expect(shikiThemeId('dracula-soft')).toBe('dracula-soft');
    const mapped = CODE_THEMES.map(shikiThemeId);
    expect(new Set(mapped).size).toBe(CODE_THEMES.length);
    expect(mapped.filter((id) => id.startsWith('material-'))).toEqual(
      mapped.filter((id) => id.startsWith('material-theme')),
    );
  });

  test('highlighted rows follow single rows and inclusive ranges', () => {
    const rows = (value: string) =>
      Array.from({ length: 8 }, (_, index) => index + 1).filter(
        highlightedRows(value),
      );
    expect(rows('')).toEqual([]);
    expect(rows('2')).toEqual([2]);
    expect(rows('1,3-5')).toEqual([1, 3, 4, 5]);
    expect(rows('6-7,2-2')).toEqual([2, 6, 7]);
    expect(rows('9-12')).toEqual([]);
  });
});

describe('code block attributes', () => {
  test('old language-only documents receive compatible defaults', () => {
    expect(codeBlockAttributesSchema.parse({ language: 'typescript' })).toEqual(
      {
        language: 'typescript',
        theme: null,
        label: '',
        lineNumbers: false,
        startLine: 1,
        highlightLines: '',
        copyButton: true,
      },
    );
  });

  test('valid ranges and every bundled theme are accepted', () => {
    for (const value of ['', '1', '1,3-5', '2-2'])
      expect(highlightLinesSchema.safeParse(value).success).toBe(true);
    for (const theme of CODE_THEMES)
      expect(codeBlockAttributesSchema.safeParse({ theme }).success).toBe(true);
  });

  test('invalid ranges are rejected', () => {
    for (const value of [
      '0',
      '-1',
      '3-1',
      '1,',
      '1,,2',
      '1.5',
      '1-2-3',
      ' 1',
      '9007199254740992',
    ])
      expect(highlightLinesSchema.safeParse(value).success).toBe(false);
  });

  test('invalid options are rejected', () => {
    for (const attrs of [
      { startLine: 0 },
      { startLine: 1.5 },
      { lineNumbers: 'true' },
      { copyButton: 1 },
      { theme: 'unknown' },
    ])
      expect(codeBlockAttributesSchema.safeParse(attrs).success).toBe(false);
  });
});
