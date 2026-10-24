import { describe, expect, test } from 'bun:test';
import { cssProblem, publicThemeSchema, walkBlocks } from '@cms/sdk';
import type { Block } from '@cms/sdk';
import { BUILTIN_THEMES } from '#api/domain/theme/builtin-themes';
import { MAGAZINE_THEME } from '#api/domain/theme/magazine-theme';
import { ThemeService } from '#api/domain/theme/theme-service';
import { zipThemeArchive } from '#api/infra/zip-theme-archive';
import { DomainError } from '#api/shared/errors';
import { MemoryJsonSettings } from '#test/support/json-settings';

const theme = MAGAZINE_THEME;
const all = (blocks: Block[]) => [...walkBlocks(blocks)];
const named = (blocks: Block[], name: string) =>
  all(blocks).filter((block) => block.name === name);
const parts = (blocks: Block[]) =>
  named(blocks, 'template-part').map((block) =>
    block.name === 'template-part' ? block.attrs.slug : '',
  );

/** WCAG 2 contrast ratio of two `#rrggbb` colors. */
const contrast = (a: string, b: string) => {
  const luminance = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((at) => {
      const value = parseInt(hex.slice(at, at + 2), 16) / 255;
      return value <= 0.04045
        ? value / 12.92
        : ((value + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  };
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light! + 0.05) / (dark! + 0.05);
};
const color = (slug: string) =>
  theme.manifest.settings.color.palette.find((entry) => entry.slug === slug)!
    .color;

describe('Magazine built-in theme', () => {
  test('is registered after the existing built-ins and cannot be replaced or removed', async () => {
    expect(BUILTIN_THEMES.map((entry) => entry.manifest.id)).toEqual([
      'canvas',
      'editorial',
      'journal',
      'magazine',
    ]);
    const themes = new ThemeService(new MemoryJsonSettings(), zipThemeArchive);
    const listed = (await themes.list()).find(
      (entry) => entry.id === 'magazine',
    );
    expect(listed).toMatchObject({ builtin: true, active: false });
    await themes.activate('magazine');
    const shown = await themes.getPublic();
    expect(shown.id).toBe('magazine');
    expect(publicThemeSchema.safeParse(shown).success).toBe(true);
    const error = await themes.remove('magazine').catch((caught) => caught);
    expect(error).toBeInstanceOf(DomainError);
    expect((error as DomainError).code).toBe('conflict');
  });

  test('covers the template hierarchy and frames every template with header and footer', () => {
    expect(Object.keys(theme.templates).sort()).toEqual(
      ['404', 'archive', 'home', 'index', 'page', 'search', 'single'].sort(),
    );
    for (const [name, blocks] of Object.entries(theme.templates)) {
      expect(parts(blocks), name).toEqual(['header', 'footer']);
      expect(blocks[0]?.name, name).toBe('template-part');
      expect(blocks.at(-1)?.name, name).toBe('template-part');
      const mains = named(blocks, 'group').filter(
        (block) => block.name === 'group' && block.attrs.tagName === 'main',
      );
      expect(mains, name).toHaveLength(1);
    }
    expect(
      theme.manifest.templateParts.map(({ slug, area }) => [slug, area]),
    ).toEqual([
      ['header', 'header'],
      ['footer', 'footer'],
    ]);
  });

  test('singular templates render content and comment slots exactly once', () => {
    for (const name of ['single', 'page']) {
      const blocks = theme.templates[name]!;
      expect(named(blocks, 'post-content'), name).toHaveLength(1);
      expect(named(blocks, 'comments'), name).toHaveLength(1);
      expect(named(blocks, 'post-title'), name).toHaveLength(1);
    }
    expect(named(theme.templates.single!, 'post-navigation')).toHaveLength(1);
  });

  test('listings follow the page query with empty states and pagination', () => {
    for (const name of ['index', 'archive', 'home', 'search']) {
      const blocks = theme.templates[name]!;
      const [query, ...rest] = named(blocks, 'query');
      expect(rest, name).toHaveLength(0);
      expect(query?.name === 'query' && query.attrs.inherit, name).toBe(true);
      expect(
        query?.children.map((child) => child.name),
        name,
      ).toEqual(['post-template', 'query-no-results', 'query-pagination']);
      expect(named(blocks, 'query-title'), name).toHaveLength(1);
    }
    for (const name of ['search', '404'])
      expect(named(theme.templates[name]!, 'search'), name).toHaveLength(1);
    expect(named(theme.templates['404']!, 'query-title')).toHaveLength(1);
  });

  test('header and footer carry navigation, search, identity and legal links', () => {
    const part = (slug: string) =>
      theme.parts[slug]!.flatMap((block) => all([block]));
    const header = part('header');
    const nav = header.find((block) => block.name === 'navigation');
    expect(nav?.name === 'navigation' && nav.attrs).toMatchObject({
      location: 'primary',
      overlay: true,
    });
    for (const name of ['site-title', 'search', 'loginout'])
      expect(
        header.some((block) => block.name === name),
        name,
      ).toBe(true);
    const footer = part('footer');
    expect(
      footer.some(
        (block) =>
          block.name === 'navigation' && block.attrs.location === 'footer',
      ),
    ).toBe(true);
    for (const name of ['copyright', 'privacy-policy-link', 'widget-area'])
      expect(
        footer.some((block) => block.name === name),
        name,
      ).toBe(true);
  });

  test('stylesheet passes the theme CSS policy and styles exactly the hooks the blocks declare', () => {
    expect(cssProblem(theme.css)).toBeNull();
    const declared = new Set(
      all([
        ...Object.values(theme.templates).flat(),
        ...Object.values(theme.parts).flat(),
      ]).flatMap((block) =>
        block.name === 'group' && block.attrs.className
          ? [`theme-${block.attrs.className}`]
          : [],
      ),
    );
    const styled = new Set(theme.css.match(/theme-[a-z0-9-]+/g));
    expect([...styled].sort()).toEqual([...declared].sort());
    // Overlay styling only applies when the lead story has an image to sit on, in the public
    // tree and inside the site editor's `[data-block-path]` frames.
    expect(theme.css).toContain(
      'li:first-child:is(:has(> .cms-block-post-featured-image), :has(> [data-block-path] > .cms-block-post-featured-image))',
    );
  });

  test('palette meets WCAG AA for text, links and buttons', () => {
    const base = color('base');
    const surface = color('surface');
    expect(contrast(color('contrast'), base)).toBeGreaterThanOrEqual(7);
    for (const slug of ['muted', 'accent'])
      for (const ground of [base, surface])
        expect(contrast(color(slug), ground), slug).toBeGreaterThanOrEqual(4.5);
    expect(contrast(base, color('accent'))).toBeGreaterThanOrEqual(4.5);
  });
});
