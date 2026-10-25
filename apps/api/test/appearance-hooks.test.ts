import { expect, test } from 'bun:test';
import { HookBus } from '#api/plugin-runtime/hook-bus';
import { MenuService } from '#api/domain/appearance/menu-service';
import { WidgetService } from '#api/domain/appearance/widget-service';
import { ReadingService } from '#api/domain/site/reading-service';
import { WritingService } from '#api/domain/site/writing-service';
import { ThemeService } from '#api/domain/theme/theme-service';
import { DEFAULT_THEME_ID } from '#api/domain/theme/builtin-themes';
import { zipThemeArchive } from '#api/infra/zip-theme-archive';
import { MemoryJsonSettings } from '#test/support/json-settings';
import { recordingLogger } from '#test/support/memory';

const actor = { id: 'admin', role: 'administrator' };
const setup = () => {
  const settings = new MemoryJsonSettings();
  const hooks = new HookBus({
    timeoutMs: 20,
    logger: recordingLogger().logger,
  });
  return { settings, hooks, registrar: hooks.registrar('test') };
};

test('widget settings reject malformed filters and notify after persistence', async () => {
  const { settings, hooks, registrar } = setup();
  const widgets = new WidgetService({
    settings,
    hooks,
    published: {
      summaries: async () => ({ items: [], total: 0 }),
      months: async () => [],
    },
    terms: { list: async () => [] },
    menus: { publicItems: async () => [] },
    comments: { recent: async () => [] },
    plugins: { types: () => [], render: async () => null },
  });
  let notified = false;
  registrar.filter('widgets.beforeSave', (dto) => {
    expect(dto).toEqual({ sidebar: [], footer: [] });
    return { sidebar: 'invalid' } as never;
  });
  registrar.on('widgets.updated', (dto) => {
    expect(JSON.parse(settings.values.get('widgets')!)).toEqual(dto);
    notified = true;
  });
  expect(await widgets.update({}, actor)).toEqual({ sidebar: [], footer: [] });
  expect(notified).toBe(true);
});

test('menus notify after saves and reject malformed filters', async () => {
  const { settings, hooks, registrar } = setup();
  const service = new MenuService({
    settings,
    hooks,
    published: { summariesByIds: async () => [] },
    terms: { list: async () => [] },
  });
  const events: string[] = [];
  for (const name of ['menu.created', 'menu.updated', 'menu.deleted'] as const)
    registrar.on(name, (dto) => {
      expect(settings.values.has('menus')).toBe(true);
      expect(dto.id).toBe('menu');
      events.push(name);
    });
  registrar.filter('menu.beforeSave', (value) => ({
    ...value,
    menus: [{ id: 'invalid', name: '', items: [] }],
  }));
  registrar.filter('menu.items', (value) => {
    expect(value[0]?.url).toBe('/');
    return [{ label: 'bad' }] as never;
  });
  await service.update(
    {
      menus: [
        { id: 'menu', name: 'Main', items: [{ id: 'home', kind: 'home' }] },
      ],
    },
    actor,
  );
  expect(await service.publicItems('menu')).toEqual([
    { label: '', url: '/', newTab: false, children: [] },
  ]);
  await service.update({ menus: [{ id: 'menu', name: 'Renamed' }] }, actor);
  await service.update({}, actor);
  expect(events).toEqual(['menu.created', 'menu.updated', 'menu.deleted']);
});

test('reading and writing emit saved section DTOs', async () => {
  const { settings, hooks, registrar } = setup();
  const events: string[] = [];
  registrar.on('settings.updated', (dto) => {
    expect(JSON.parse(settings.values.get(dto.section)!)).toEqual(dto.settings);
    events.push(dto.section);
  });
  await new ReadingService(
    settings,
    { summariesByIds: async () => [] },
    hooks,
  ).update({});
  await new WritingService(settings, hooks).update({});
  expect(events).toEqual(['reading', 'writing']);
});

test('theme activation and customization resets publish persisted DTOs', async () => {
  const { settings, hooks, registrar } = setup();
  const themes = new ThemeService(settings, zipThemeArchive, undefined, hooks);
  const events: string[] = [];
  registrar.on('theme.activated', (dto) => {
    expect(dto.id).toBe(DEFAULT_THEME_ID);
    expect(dto.active).toBe(true);
    events.push('theme.activated');
  });
  for (const name of [
    'template.updated',
    'templatePart.updated',
    'styles.updated',
  ] as const)
    registrar.on(name, (dto) => {
      expect(dto.themeId).toBe(DEFAULT_THEME_ID);
      expect(dto.customization).toBeDefined();
      events.push(name);
    });
  await themes.activate(DEFAULT_THEME_ID);
  await themes.saveTemplate(DEFAULT_THEME_ID, 'single', {
    blocks: [{ name: 'site-title' }],
  });
  await themes.resetTemplate(DEFAULT_THEME_ID, 'single');
  await themes.savePart(DEFAULT_THEME_ID, 'extra', {
    blocks: [{ name: 'site-title' }],
  });
  await themes.resetPart(DEFAULT_THEME_ID, 'extra');
  const editor = await themes.editor(DEFAULT_THEME_ID);
  const color = editor.settings.palette[0]!;
  await themes.saveStyles(DEFAULT_THEME_ID, {
    colors: { [color.slug]: '#123456' },
    styles: editor.styles.current,
  });
  await themes.resetStyles(DEFAULT_THEME_ID);
  expect(events).toEqual([
    'theme.activated',
    'template.updated',
    'template.updated',
    'templatePart.updated',
    'templatePart.updated',
    'styles.updated',
    'styles.updated',
  ]);
});
