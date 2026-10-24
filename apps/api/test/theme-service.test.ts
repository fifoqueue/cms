import { describe, expect, test } from 'bun:test';
import { zipSync, strToU8 } from 'fflate';
import {
  cssProblem,
  publicThemeSchema,
  themeEditorSchema,
  themeManifestSchema,
} from '@cms/sdk';
import {
  BUILTIN_THEMES,
  DEFAULT_THEME_ID,
} from '#api/domain/theme/builtin-themes';
import { ThemeService } from '#api/domain/theme/theme-service';
import { zipThemeArchive } from '#api/infra/zip-theme-archive';
import { sharpImages } from '#api/infra/sharp-images';
import { DomainError } from '#api/shared/errors';
import { MemoryJsonSettings } from '#test/support/json-settings';

const manifest = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  name: `Theme ${id}`,
  version: '1.0.0',
  settings: {
    color: {
      palette: ['base', 'surface', 'contrast', 'muted', 'accent', 'border'].map(
        (slug) => ({ slug, name: slug, color: '#123456' }),
      ),
    },
    typography: {
      fontFamilies: [{ slug: 'sans', name: 'Sans', fontFamily: 'system-ui' }],
    },
  },
  styles: { fontFamily: 'sans' },
  ...overrides,
});

const index = [
  { name: 'template-part', attrs: { slug: 'header' } },
  {
    name: 'query',
    children: [{ name: 'post-template', children: [{ name: 'post-title' }] }],
  },
];

/** A theme archive as a WordPress author would zip it: everything inside one folder. */
const archive = (
  id: string,
  files: Record<string, unknown> = {},
  theme: Record<string, unknown> = manifest(id),
) =>
  zipSync(
    Object.fromEntries(
      Object.entries({
        'theme.json': theme,
        'templates/index.json': index,
        'parts/header.json': [{ name: 'site-title' }],
        ...files,
      }).map(([path, value]) => [
        `${id}/${path}`,
        value instanceof Uint8Array
          ? value
          : strToU8(typeof value === 'string' ? value : JSON.stringify(value)),
      ]),
    ),
  );

const setup = () => {
  const settings = new MemoryJsonSettings();
  return { settings, themes: new ThemeService(settings, zipThemeArchive) };
};

const codeOf = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    if (error instanceof DomainError) return error.code;
    throw error;
  }
  return 'ok';
};

describe('ThemeService defaults', () => {
  test('without configuration the default built-in is active and nothing is written', async () => {
    const { settings, themes } = setup();

    expect((await themes.getPublic()).id).toBe(DEFAULT_THEME_ID);
    const list = await themes.list();
    expect(list.map((theme) => theme.id)).toEqual(
      BUILTIN_THEMES.map((theme) => theme.manifest.id),
    );
    expect(
      list.filter((theme) => theme.active).map((theme) => theme.id),
    ).toEqual([DEFAULT_THEME_ID]);
    expect(settings.writes).toBe(0);
  });

  test('every built-in theme renders through the strict public contract', async () => {
    const { themes } = setup();
    for (const theme of BUILTIN_THEMES) {
      const shown = await themes.find(theme.manifest.id);
      expect(publicThemeSchema.safeParse(shown).success).toBe(true);
      expect(shown?.templates.index?.length).toBeGreaterThan(0);
    }
  });
});

describe('ThemeService archives', () => {
  test('installs a zipped block theme, persists it and upgrades it in place', async () => {
    const { settings, themes } = setup();
    const installed = await themes.install(
      archive('acme', { 'style.css': '/* hi */ .x { color: red }' }),
    );
    expect(installed).toMatchObject({
      id: 'acme',
      active: false,
      builtin: false,
    });

    await themes.activate('acme');
    await themes.install(
      archive('acme', {}, manifest('acme', { version: '2.0.0' })),
    );
    const reloaded = new ThemeService(settings, zipThemeArchive);
    const shown = await reloaded.getPublic();
    expect(shown).toMatchObject({ id: 'acme', version: '2.0.0' });
    expect(shown.parts.find((part) => part.slug === 'header')?.area).toBe(
      'header',
    );
  });

  test('keeps a decodable screenshot with the theme and drops it on upgrade or removal', async () => {
    const themes = new ThemeService(
      new MemoryJsonSettings(),
      zipThemeArchive,
      sharpImages,
    );
    // A real 1×1 PNG; a PNG signature followed by junk is refused like any non-image.
    const png = Uint8Array.from(
      atob(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      ),
      (char) => char.charCodeAt(0),
    );
    const fake = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 1, 2,
    ]);
    for (const screenshot of [strToU8('<svg></svg>.......'), fake])
      expect(
        await codeOf(
          themes.install(archive('shot', { 'screenshot.png': screenshot })),
        ),
      ).toBe('invalid_input');

    await themes.install(archive('shot', { 'screenshot.png': png }));
    const listed = (await themes.list()).find((theme) => theme.id === 'shot');
    expect(listed?.screenshot).toBeString();
    expect(await themes.screenshot('shot')).toEqual({
      type: 'image/png',
      bytes: png,
    });

    await themes.install(archive('shot'));
    expect(await themes.screenshot('shot')).toBeNull();
    expect(
      (await themes.list()).find((theme) => theme.id === 'shot')?.screenshot,
    ).toBeNull();
  });

  test('refuses broken archives, invalid blocks, missing index and built-in ids', async () => {
    const { themes } = setup();
    expect(await codeOf(themes.install(new Uint8Array([1, 2, 3])))).toBe(
      'invalid_input',
    );
    expect(
      await codeOf(
        themes.install(
          archive('acme', { 'templates/index.json': [{ name: 'script' }] }),
        ),
      ),
    ).toBe('invalid_input');
    expect(
      await codeOf(
        themes.install(
          archive('acme', {
            'templates/index.json': [{ name: 'post-template' }],
          }),
        ),
      ),
    ).toBe('invalid_input');
    expect(
      await codeOf(
        themes.install(
          zipSync({ 'theme.json': strToU8(JSON.stringify(manifest('acme'))) }),
        ),
      ),
    ).toBe('invalid_input');
    expect(await codeOf(themes.install(archive(DEFAULT_THEME_ID)))).toBe(
      'conflict',
    );
  });

  test('stylesheets cannot load resources or break out of the site scope', () => {
    expect(
      cssProblem(
        '.a { color: red } @media (min-width: 1px) { .b { margin: 0 } }',
      ),
    ).toBeNull();
    for (const css of [
      '@import "https://evil.test/x.css";',
      '.a { background: url(https://evil.test/x.png) }',
      '.a { background: image-set("x.png" 1x) }',
      '.a { content: "\\75 rl" }',
      '</style><script>',
      '} body { display: none }',
      '.a { content: "{" } } body { display: none } .b {',
      '.a { /* { */ } } body { color: red } .b {',
    ])
      expect(cssProblem(css)).not.toBeNull();
  });
});

describe('ThemeService site editor', () => {
  test('template, part and style changes apply publicly and reset to the theme files', async () => {
    const { themes } = setup();
    const id = DEFAULT_THEME_ID;
    const original = await themes.getPublic();

    await themes.saveTemplate(id, 'category-news', {
      blocks: [{ name: 'query-title' }],
    });
    await themes.savePart(id, 'header', { blocks: [{ name: 'site-title' }] });
    await themes.saveStyles(id, {
      colors: { accent: '#ff0000', base: original.settings.palette[0]!.color },
      styles: { ...original.styles, radius: 'none' },
    });

    const changed = await themes.getPublic();
    expect(changed.templates['category-news']?.[0]?.name).toBe('query-title');
    expect(
      changed.parts.find((part) => part.slug === 'header')?.blocks,
    ).toHaveLength(1);
    expect(
      changed.settings.palette.find((c) => c.slug === 'accent')?.color,
    ).toBe('#ff0000');
    expect(changed.styles.radius).toBe('none');
    const editor = await themes.editor(id);
    // Only differences are stored, so unchanged colors still follow theme upgrades.
    expect(editor.styles.colors).toEqual({ accent: '#ff0000' });
    expect(
      (await themes.list()).find((theme) => theme.id === id)?.customized,
    ).toBe(true);

    expect(
      await codeOf(
        themes.saveStyles(id, {
          colors: { nope: '#000000' },
          styles: original.styles,
        }),
      ),
    ).toBe('invalid_input');
    expect(await codeOf(themes.savePart(id, 'reusable', { blocks: [] }))).toBe(
      'ok',
    );
    expect(
      (await themes.editor(id)).parts.some((part) => part.slug === 'reusable'),
    ).toBe(true);
    expect(await codeOf(themes.saveTemplate(id, 'bogus', { blocks: [] }))).toBe(
      'not_found',
    );

    await themes.resetTemplate(id, 'category-news');
    await themes.resetPart(id, 'header');
    await themes.resetPart(id, 'reusable');
    await themes.resetStyles(id);
    expect(await themes.getPublic()).toEqual(original);
    expect(
      (await themes.list()).find((theme) => theme.id === id)?.customized,
    ).toBe(false);
  });

  test('removing an installed theme also removes its changes', async () => {
    const { settings, themes } = setup();
    await themes.install(archive('acme'));
    await themes.savePart('acme', 'header', { blocks: [] });
    await themes.remove('acme');
    expect(JSON.parse(settings.values.get('themes.customizations')!)).toEqual(
      {},
    );
  });
});

describe('ThemeService lifecycle rules', () => {
  test('removal refuses built-ins, the active theme and unknown ids', async () => {
    const { themes } = setup();
    await themes.install(archive('acme'));
    await themes.activate('acme');
    expect(await codeOf(themes.remove(DEFAULT_THEME_ID))).toBe('conflict');
    expect(await codeOf(themes.remove('acme'))).toBe('conflict');
    expect(await codeOf(themes.remove('missing'))).toBe('not_found');
  });

  test('damaged stored state falls back to the default built-in', async () => {
    const { settings, themes } = setup();
    settings.values.set(
      'themes',
      JSON.stringify({
        active: 'gone',
        installed: [{ manifest: { id: 'x' } }, 7],
      }),
    );
    settings.values.set(
      'themes.customizations',
      JSON.stringify({ gone: {}, [DEFAULT_THEME_ID]: 'bad' }),
    );
    expect((await themes.getPublic()).id).toBe(DEFAULT_THEME_ID);
    expect((await themes.list()).every((theme) => theme.builtin)).toBe(true);
  });

  test('the public theme carries no management state', async () => {
    const { themes } = setup();
    const shown = (await themes.getPublic()) as Record<string, unknown>;
    for (const key of [
      'active',
      'builtin',
      'customized',
      'description',
      'author',
    ])
      expect(key in shown).toBe(false);
  });
});

describe('ThemeService scroll-to-top option', () => {
  test('a theme without the option shows the button, like every built-in', async () => {
    const { themes } = setup();
    expect(
      themeManifestSchema.parse(manifest('plain')).settings.scrollToTop,
    ).toBe(true);
    await themes.install(archive('plain'));
    expect((await themes.find('plain'))?.settings.scrollToTop).toBe(true);
    for (const theme of BUILTIN_THEMES)
      expect((await themes.find(theme.manifest.id))?.settings.scrollToTop).toBe(
        true,
      );
  });

  test('a theme can turn it off, and the public and editor contracts keep that', async () => {
    const { themes } = setup();
    const base = manifest('quiet');
    await themes.install(
      archive(
        'quiet',
        {},
        {
          ...base,
          settings: { ...base.settings, scrollToTop: false },
        },
      ),
    );

    const shown = await themes.find('quiet');
    expect(shown?.settings.scrollToTop).toBe(false);
    expect(publicThemeSchema.parse(shown).settings.scrollToTop).toBe(false);
    const editor = await themes.editor('quiet');
    expect(editor.settings.scrollToTop).toBe(false);
    expect(themeEditorSchema.parse(editor).settings.scrollToTop).toBe(false);
  });
});
