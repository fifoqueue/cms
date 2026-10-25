import { describe, expect, test } from 'bun:test';
import { siteFontsSchema } from '@cms/sdk';
import { fontFaceCss } from '#lib/theme/style.js';
import { fontsAfter } from '#lib/server/theme-admin.js';
import {
  fontIssueField,
  fontIssues,
  fontsActionUrl,
} from '#lib/admin/font-issues.js';

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
};

describe('site fonts', () => {
  test('font files become @font-face rules with their format, weight, style and display', () => {
    const css = fontFaceCss([
      {
        family: 'Nanum Gothic',
        stylesheet: '',
        faces: [
          {
            src: '/media/2026/10/nanum.woff2',
            weight: 400,
            style: 'normal',
            display: 'swap',
          },
          {
            src: 'https://cdn.example.com/nanum-bold.ttf',
            weight: 700,
            style: 'italic',
            display: 'fallback',
          },
        ],
      },
      // Stylesheet fonts are linked, not written as rules.
      {
        family: 'Inter',
        stylesheet: 'https://fonts.googleapis.com/css2?family=Inter',
        faces: [],
      },
    ]);
    expect(css).toBe(
      [
        '@font-face { font-family: "Nanum Gothic"; src: url("/media/2026/10/nanum.woff2") format("woff2"); font-weight: 400; font-style: normal; font-display: swap; }',
        '@font-face { font-family: "Nanum Gothic"; src: url("https://cdn.example.com/nanum-bold.ttf") format("truetype"); font-weight: 700; font-style: italic; font-display: fallback; }',
      ].join('\n'),
    );
  });

  test('API issues of the whole font list map to the add-font inputs; list-wide ones stay above the form', () => {
    expect(fontIssueField('fonts.0.family')).toBe('family');
    expect(fontIssueField('fonts.3.stylesheet')).toBe('stylesheet');
    expect(fontIssueField('fonts.1.faces.2.src')).toBe('src');
    expect(fontIssueField('fonts.1.faces.0.weight')).toBe('weight');
    expect(fontIssueField('fonts.1.faces.0.style')).toBe('style');
    expect(fontIssueField('fonts.1.faces.0.display')).toBe('display');
    expect(fontIssueField('fonts.0.fallback')).toBe('fallback');
    for (const path of ['fonts', 'fonts.2', 'fonts.0.faces', 'theme', ''])
      expect(fontIssueField(path), path).toBeNull();

    const { fields, rest } = fontIssues([
      { path: 'fonts.1.family', message: 'Bad family' },
      { path: 'fonts.1.faces.0.src', message: 'Bad file' },
      { path: 'fonts.1.faces.0.src', message: 'Too long' },
      { path: 'fonts', message: 'Duplicate' },
    ]);
    expect(fields.family?.map((issue) => issue.message)).toEqual([
      'Bad family',
    ]);
    expect(fields.src?.map((issue) => issue.message)).toEqual([
      'Bad file',
      'Too long',
    ]);
    expect(rest.map((issue) => issue.message)).toEqual(['Duplicate']);
  });

  test('the font form posts to the current editor address, so the Styles panel renders after the action', () => {
    expect(fontsActionUrl('?theme=journal&edit=styles')).toBe(
      '?theme=journal&edit=styles&/saveFonts',
    );
    expect(
      fontsActionUrl('?theme=journal&edit=styles&notice=saved&/saveFonts'),
    ).toBe('?theme=journal&edit=styles&/saveFonts');
    expect(fontsActionUrl('')).toBe('?/saveFonts');
    // The action name SvelteKit reads is the only key starting with "/".
    const params = new URLSearchParams(
      fontsActionUrl('?theme=a%26b&edit=styles').slice(1),
    );
    expect(params.get('theme')).toBe('a&b');
    expect([...params.keys()].filter((key) => key.startsWith('/'))).toEqual([
      '/saveFonts',
    ]);
  });

  test('the API reports invalid fonts under paths the form maps', () => {
    const parsed = siteFontsSchema.safeParse([
      { slug: 'a', family: 'A', stylesheet: 'http://x.test/a.css' },
      { slug: 'b', family: 'B', faces: [{ src: '/media/b.png', weight: 0 }] },
    ]);
    expect(parsed.success).toBe(false);
    const fields = parsed.error!.issues.map((issue) =>
      fontIssueField(['fonts', ...issue.path].join('.')),
    );
    expect(fields).toEqual(
      expect.arrayContaining(['stylesheet', 'src', 'weight']),
    );
  });

  test('the Styles form adds a stylesheet family, adds faces to a file family and removes fonts', () => {
    const added = fontsAfter(
      [],
      form({
        op: 'add',
        family: 'Nanum Gothic',
        source: 'stylesheet',
        stylesheet: 'https://fonts.googleapis.com/css2?family=Nanum+Gothic',
      }),
    )!;
    expect(added).toEqual([
      {
        slug: 'nanum-gothic',
        family: 'Nanum Gothic',
        fallback: 'sans-serif',
        stylesheet: 'https://fonts.googleapis.com/css2?family=Nanum+Gothic',
      },
    ]);
    const file = (weight: string) =>
      form({
        op: 'add',
        family: 'Brand',
        source: 'file',
        src: `/media/brand-${weight}.woff2`,
        weight,
      });
    const brand = siteFontsSchema.parse(
      fontsAfter(
        siteFontsSchema.parse(fontsAfter([], file('400'))),
        file('700'),
      ),
    );
    expect(brand).toHaveLength(1);
    expect(brand[0]!.faces.map((face) => face.weight)).toEqual([400, 700]);
    expect(fontsAfter(brand, form({ op: 'remove', slug: 'brand' }))).toEqual(
      [],
    );
    expect(fontsAfter(brand, form({ op: 'other' }))).toBeNull();
  });
});
