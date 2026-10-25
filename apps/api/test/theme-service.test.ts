import { describe, expect, test } from 'bun:test';
import { zipSync, strToU8 } from 'fflate';
import {
  cssProblem,
  publicThemeSchema,
  siteFontsSchema,
  themeEditorSchema,
  themeManifestSchema,
  walkBlocks,
} from '@cms/sdk';
import type { Block } from '@cms/sdk';
import {
  BUILTIN_THEMES,
  DEFAULT_THEME_ID,
} from '#api/domain/theme/builtin-themes';
import { ThemeService } from '#api/domain/theme/theme-service';
import { zipThemeArchive } from '#api/infra/zip-theme-archive';
import { sharpImages } from '#api/infra/sharp-images';
import { DomainError } from '#api/shared/errors';
import { MemoryJsonSettings } from '#test/support/json-settings';
import { HookBus } from '#api/plugin-runtime/hook-bus';
import { recordingLogger } from '#test/support/memory';

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

test('theme install and deletion publish admin DTOs after successful writes only', async () => {
  const settings = new MemoryJsonSettings();
  const hooks = new HookBus({
    timeoutMs: 20,
    logger: recordingLogger().logger,
  });
  const themes = new ThemeService(settings, zipThemeArchive, undefined, hooks);
  const events: string[] = [];
  for (const event of ['theme.installed', 'theme.deleted'] as const)
    hooks.registrar('test').on(event, (dto) => {
      expect(dto.id).toBe('hook-theme');
      expect(dto.name).toBe('Theme hook-theme');
      expect(dto.active).toBe(false);
      expect(settings.writes).toBeGreaterThan(0);
      events.push(event);
    });
  await themes.install(archive('hook-theme'));
  await themes.remove('hook-theme');
  await expect(themes.remove('hook-theme')).rejects.toMatchObject({
    code: 'not_found',
  });
  expect(events).toEqual(['theme.installed', 'theme.deleted']);
});

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

  test('ships exactly Canvas (the default, as before) and Journal (dark, with a scheme toggle)', async () => {
    const { themes } = setup();
    expect(BUILTIN_THEMES.map(({ manifest }) => manifest.id)).toEqual([
      DEFAULT_THEME_ID,
      'journal',
    ]);
    expect(DEFAULT_THEME_ID).toBe('canvas');

    const canvas = (await themes.find('canvas'))!;
    expect(
      canvas.settings.palette.map(({ slug, color }) => [slug, color]),
    ).toEqual([
      ['base', '#ffffff'],
      ['surface', '#f7f7f8'],
      ['contrast', '#18181b'],
      ['muted', '#71717a'],
      ['accent', '#4f46e5'],
      ['border', '#e4e4e7'],
    ]);
    expect(canvas.settings.fontFamilies.map((font) => font.slug)).toEqual([
      'sans',
      'serif',
    ]);
    expect(canvas.settings.layout).toEqual({
      contentSize: '44rem',
      wideSize: '72rem',
    });
    expect(canvas.settings.alternatePalette).toEqual([]);
    expect(canvas.settings.colorScheme).toEqual({ auto: false, toggle: false });
    expect(canvas.css).toBe('');
    const canvasBlocks = [
      ...walkBlocks([
        ...Object.values(canvas.templates).flat(),
        ...canvas.parts.flatMap((part) => part.blocks),
      ]),
    ];
    expect(canvasBlocks.some((block) => block.name === 'scheme-toggle')).toBe(
      false,
    );

    const journal = (await themes.find('journal'))!;
    expect(journal.settings.colorScheme.toggle).toBe(true);
    expect(
      journal.settings.alternatePalette.map((entry) => entry.slug).sort(),
    ).toEqual(journal.settings.palette.map((entry) => entry.slug).sort());
    expect(
      journal.settings.palette.find((entry) => entry.slug === 'base')?.color,
    ).toBe('#1c1c1c');
    expect(journal.settings.fontFamilies[0]?.fontFamily).toStartWith(
      '"Nanum Gothic",',
    );
    // The admin's bundled Inter Variable face is never named by a public theme stack.
    for (const { manifest } of BUILTIN_THEMES)
      for (const font of manifest.settings.typography.fontFamilies)
        expect(font.fontFamily, manifest.id).not.toContain('Inter Variable');
    const single = [...walkBlocks(journal.templates.single!)];
    expect(single.some((block) => block.name === 'post-navigation')).toBe(true);
  });

  test('search results use the same post list layout as the home page', () => {
    const query = (blocks: Block[]) =>
      [...walkBlocks(blocks)].find((block) => block.name === 'query');
    for (const theme of BUILTIN_THEMES) {
      const home = query(theme.templates.home!);
      const search = query(theme.templates.search!);
      expect(home?.attrs).toBeDefined();
      expect(search?.name === 'query' && search.attrs.layout).toBe(
        home?.name === 'query' && home.attrs.layout,
      );
    }
    const journalHome = query(
      BUILTIN_THEMES.find(({ manifest }) => manifest.id === 'journal')!
        .templates.home!,
    );
    expect(journalHome?.name === 'query' && journalHome.attrs).toMatchObject({
      layout: 'grid',
      columns: 3,
    });
  });

  test('no source file, class or text names the reference design', async () => {
    const root = new URL('../../../', import.meta.url).pathname.replace(
      /^\/([A-Za-z]:)/,
      '$1',
    );
    const hits: string[] = [];
    for (const dir of ['apps/api/src', 'apps/web/src', 'packages', 'docs'])
      for await (const path of new Bun.Glob(
        '**/*.{ts,svelte,css,md,json}',
      ).scan({ cwd: `${root}${dir}`, onlyFiles: true }))
        if (
          !path.includes('node_modules') &&
          /swyft/i.test(path + (await Bun.file(`${root}${dir}/${path}`).text()))
        )
          hits.push(`${dir}/${path}`);
    expect(hits).toEqual([]);
  });

  test('every template frames its blocks with the header and footer parts and renders entries once', () => {
    const parts = (blocks: Block[]) =>
      [...walkBlocks(blocks)].flatMap((block) =>
        block.name === 'template-part' ? [block.attrs.slug] : [],
      );
    for (const theme of BUILTIN_THEMES) {
      for (const [name, blocks] of Object.entries(theme.templates))
        expect(parts(blocks), name).toEqual(['header', 'footer']);
      for (const name of ['single', 'page']) {
        const blocks = [...walkBlocks(theme.templates[name]!)];
        for (const slot of ['post-content', 'comments'])
          expect(blocks.filter((block) => block.name === slot)).toHaveLength(1);
      }
      expect(cssProblem(theme.css)).toBeNull();
    }
  });
});

describe('ThemeService color schemes', () => {
  test('an alternate palette must use the palette slugs, and scheme options need one', () => {
    const base = manifest('schemes');
    const alternate = base.settings.color.palette.map((entry) => ({
      ...entry,
      color: '#fafafa',
    }));
    const withColor = (color: Record<string, unknown>, scheme = {}) => ({
      ...base,
      settings: { ...base.settings, color, colorScheme: scheme },
    });
    expect(
      themeManifestSchema.safeParse(
        withColor(
          { ...base.settings.color, alternatePalette: alternate },
          { toggle: true },
        ),
      ).success,
    ).toBe(true);
    expect(
      themeManifestSchema.safeParse(
        withColor({
          ...base.settings.color,
          alternatePalette: alternate.slice(1),
        }),
      ).success,
    ).toBe(false);
    expect(
      themeManifestSchema.safeParse(
        withColor(base.settings.color, { auto: true }),
      ).success,
    ).toBe(false);
    expect(themeManifestSchema.parse(base).settings.colorScheme).toEqual({
      auto: false,
      toggle: false,
    });
  });
});

describe('ThemeService site fonts', () => {
  const stylesheet = {
    slug: 'nanum-gothic',
    family: 'Nanum Gothic',
    stylesheet:
      'https://fonts.googleapis.com/css2?family=Nanum+Gothic:wght@400;700&display=swap',
  };

  test('font settings accept https stylesheets and font files only', () => {
    const ok = (font: Record<string, unknown>) =>
      siteFontsSchema.safeParse([font]).success;
    expect(ok(stylesheet)).toBe(true);
    expect(
      ok({
        slug: 'brand',
        family: 'Brand Sans',
        faces: [
          { src: '/media/2026/10/brand.woff2', weight: 700 },
          {
            src: 'https://cdn.example.com/fonts/brand-italic.ttf',
            style: 'italic',
          },
        ],
      }),
    ).toBe(true);
    for (const bad of [
      {
        ...stylesheet,
        stylesheet: 'http://fonts.googleapis.com/css2?family=X',
      },
      { ...stylesheet, stylesheet: 'javascript:alert(1)' },
      { ...stylesheet, stylesheet: 'https://user:pass@example.com/a.css' },
      { ...stylesheet, stylesheet: 'https://example.com/a.css");}body{x' },
      { ...stylesheet, stylesheet: 'https://example.com/a b.css' },
      { ...stylesheet, family: 'Bad"Name' },
      { slug: 'x', family: 'X' },
      { ...stylesheet, faces: [{ src: '/media/a.woff2' }] },
      { slug: 'x', family: 'X', faces: [{ src: '/media/x.png' }] },
      { slug: 'x', family: 'X', faces: [{ src: '/media/../x.woff2' }] },
      { slug: 'x', family: 'X', faces: [{ src: 'https://e.com/x.woff2?(' }] },
      { slug: 'x', family: 'X', faces: [{ src: 'data:font/woff2;base64,AA' }] },
    ])
      expect(ok(bad), JSON.stringify(bad)).toBe(false);
    expect(siteFontsSchema.safeParse([stylesheet, stylesheet]).success).toBe(
      false,
    );
  });

  test('a theme stack that names a site font loads it; admin choices win; others are not sent', async () => {
    const { themes } = setup();
    expect((await themes.find('journal'))?.fonts).toEqual([]);
    await themes.saveFonts({
      fonts: [
        stylesheet,
        {
          slug: 'brand',
          family: 'Brand Sans',
          fallback: 'serif',
          faces: [{ src: '/media/2026/10/brand.woff2' }],
        },
      ],
    });
    expect(
      await codeOf(
        themes.saveFonts({ fonts: [{ ...stylesheet, stylesheet: 'ftp://x' }] }),
      ),
    ).toBe('invalid_input');

    // Journal's body stack names Nanum Gothic, so that family loads; the unused one does not.
    const journal = (await themes.find('journal'))!;
    expect(journal.fonts).toEqual([
      { family: 'Nanum Gothic', stylesheet: stylesheet.stylesheet, faces: [] },
    ]);
    expect(publicThemeSchema.safeParse(journal).success).toBe(true);
    // Canvas's stacks do not name it.
    expect((await themes.find('canvas'))?.fonts).toEqual([]);

    // Choosing a site font for headings uses its stack and loads its faces.
    const editor = await themes.editor('canvas');
    expect(editor.siteFonts.map((font) => font.slug)).toEqual([
      'nanum-gothic',
      'brand',
    ]);
    await themes.saveStyles('canvas', {
      colors: {},
      styles: { ...editor.styles.current, headingFontFamily: 'brand' },
    });
    const canvas = (await themes.find('canvas'))!;
    expect(canvas.styles.headingFontFamily).toBe('brand');
    expect(
      canvas.settings.fontFamilies.find((font) => font.slug === 'brand')
        ?.fontFamily,
    ).toBe('"Brand Sans", serif');
    expect(canvas.fonts).toEqual([
      {
        family: 'Brand Sans',
        stylesheet: '',
        faces: [
          {
            src: '/media/2026/10/brand.woff2',
            weight: 400,
            style: 'normal',
            display: 'swap',
          },
        ],
      },
    ]);

    // Journal declares its own heading font; choose the site font there too.
    const journalEditor = await themes.editor('journal');
    expect(journalEditor.styles.theme.headingFontFamily).toBe('system');
    await themes.saveStyles('journal', {
      colors: {},
      styles: { ...journalEditor.styles.current, headingFontFamily: 'brand' },
    });
    expect((await themes.find('journal'))?.styles.headingFontFamily).toBe(
      'brand',
    );

    // Removing the font restores each theme's own default, not "same as body".
    await themes.saveFonts({ fonts: [stylesheet] });
    const fallback = (await themes.find('canvas'))!;
    expect(fallback.styles.headingFontFamily).toBe('');
    expect(fallback.fonts).toEqual([]);
    expect((await themes.find('journal'))?.styles.headingFontFamily).toBe(
      'system',
    );
  });
});

describe('ThemeService removed built-ins', () => {
  test('a stored active theme or changes for a removed built-in fall back to Canvas; others keep theirs', async () => {
    const { settings, themes } = setup();
    settings.values.set(
      'themes',
      JSON.stringify({ active: 'magazine', installed: [] }),
    );
    settings.values.set(
      'themes.customizations',
      JSON.stringify({
        editorial: { colors: { accent: '#ff0000' } },
        magazine: { templates: { index: [{ name: 'site-title' }] } },
        journal: { colors: { accent: '#00ff00' } },
      }),
    );

    const shown = await themes.getPublic();
    expect(shown.id).toBe(DEFAULT_THEME_ID);
    expect(publicThemeSchema.safeParse(shown).success).toBe(true);
    const listed = await themes.list();
    expect(listed.map((theme) => theme.id)).toEqual(['canvas', 'journal']);
    expect(listed.find((theme) => theme.active)?.id).toBe(DEFAULT_THEME_ID);
    expect(
      (await themes.find('journal'))?.settings.palette.find(
        (entry) => entry.slug === 'accent',
      )?.color,
    ).toBe('#00ff00');
    expect(await themes.find('editorial')).toBeNull();
    expect(await codeOf(themes.activate('magazine'))).toBe('not_found');
    expect(await codeOf(themes.editor('editorial'))).toBe('not_found');

    // Activating keeps working and rewrites the stale setting.
    await themes.activate('journal');
    expect(JSON.parse(settings.values.get('themes')!).active).toBe('journal');

    // A theme installed later under a removed id starts without the old changes.
    await themes.install(archive('magazine'));
    expect((await themes.find('magazine'))?.templates.index).toHaveLength(2);
    expect(
      Object.keys(JSON.parse(settings.values.get('themes.customizations')!)),
    ).toEqual(['journal']);
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
