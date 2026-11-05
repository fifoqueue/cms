import { expect, test } from 'bun:test';
import { ThemeService } from '#api/domain/theme/theme-service';
import { zipThemeArchive } from '#api/infra/zip-theme-archive';
import { HookBus } from '#api/plugin-runtime/hook-bus';
import { BUILTIN_THEMES } from '#api/domain/theme/builtin-themes';
import { walkBlocks } from '@cms/sdk';

test('built-in entry templates group their title and body as articles and offer related links on singles', () => {
  for (const theme of BUILTIN_THEMES) {
    for (const name of ['single', 'page']) {
      const article = [...walkBlocks(theme.templates[name]!)].find(
        (block) => block.name === 'group' && block.attrs.tagName === 'article',
      );

      expect(article).toBeDefined();
      const names = [...walkBlocks(article!.children)].map(
        (block) => block.name,
      );

      expect(names).toContain('post-title');
      expect(names).toContain('post-content');
      if (name === 'single') expect(names).toContain('related-posts');
    }
  }
});

test('public theme edits validate while identity and templates stay fixed', async () => {
  const hooks = new HookBus({
    timeoutMs: 100,
    logger: { info() {}, warn() {}, error() {} },
  });
  const themes = new ThemeService(
    {
      async get() {},
      async set() {},
      async list() {
        return {};
      },
    },
    zipThemeArchive,
    undefined,
    hooks,
  );
  const original = await themes.getPublic();
  const registrar = hooks.registrar('functions:site', { trusted: true });
  const remove = registrar.filter('theme.public', (theme) => {
    theme.settings.scrollToTop = !original.settings.scrollToTop;

    return theme;
  });

  expect((await themes.getPublic()).settings.scrollToTop).toBe(
    !original.settings.scrollToTop,
  );
  expect(await themes.find(original.id, true)).toMatchObject({
    preview: true,
    settings: { scrollToTop: !original.settings.scrollToTop },
  });
  remove();
  const reject = registrar.filter('theme.public', (theme) => {
    theme.id = 'changed';
    theme.templates = {};

    return theme;
  });

  expect(await themes.getPublic()).toEqual(original);
  reject();
  const unsafeFont = registrar.filter('theme.public', (theme) => ({
    ...theme,
    fonts: [
      {
        family: '</style><script>alert(1)</script>',
        stylesheet: '',
        faces: [
          {
            src: '/media/font.woff2',
            weight: 400,
            style: 'normal' as const,
            display: 'swap' as const,
          },
        ],
      },
    ],
  }));

  expect((await themes.getPublic()).fonts).toEqual(original.fonts);
  unsafeFont();
  registrar.filter('theme.public', (theme) => {
    theme.settings.layout.contentSize = 'url(javascript:alert(1))';

    return theme;
  });
  expect(await themes.getPublic()).toEqual(original);
});
