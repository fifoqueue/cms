import { expect, test } from 'bun:test';
import { WidgetService } from '#api/domain/appearance/widget-service';
import { HookBus } from '#api/plugin-runtime/hook-bus';

test('public widgets allow edits and removal but reject unknown kinds', async () => {
  const hooks = new HookBus({
    timeoutMs: 100,
    logger: { info() {}, warn() {}, error() {} },
  });
  const service = new WidgetService({
    hooks,
    settings: {
      async get() {
        return {
          sidebar: [
            { id: 'one', type: 'text', settings: { text: 'original' } },
            { id: 'two', type: 'search' },
          ],
          footer: [],
        };
      },
      async set() {},
      async list() {
        return {};
      },
    },
    published: {
      async summaries() {
        throw new Error('unexpected');
      },
      async months() {
        return [];
      },
    },
    terms: {
      async list() {
        return [];
      },
    },
    menus: {
      async publicItems() {
        return [];
      },
    },
    comments: {
      async recent() {
        return [];
      },
    },
    plugins: {
      types() {
        return [];
      },
      async render() {
        return null;
      },
    },
  });
  const registrar = hooks.registrar('functions:site', { trusted: true });
  const remove = registrar.filter('widgets.public', (value) => ({
    ...value,
    sidebar: [{ ...value.sidebar[1]!, title: 'Find' }],
  }));

  expect((await service.getPublic()).sidebar).toEqual([
    { id: 'two', kind: 'search', title: 'Find' },
  ]);
  remove();
  const edit = registrar.filter('widgets.public', (value) => {
    value.sidebar[0]!.settings = { text: '**updated**' };

    return value;
  });

  expect((await service.getPublic()).sidebar[0]).toMatchObject({
    kind: 'text',
    text: '**updated**',
    paragraphs: [[{ text: 'updated', strong: true }]],
  });
  edit();
  const invalid = registrar.filter('widgets.public', (value) => {
    value.sidebar[0]!.settings = { text: 42 };

    return value;
  });

  expect((await service.getPublic()).sidebar[0]).toMatchObject({
    text: 'original',
  });
  invalid();
  registrar.filter('widgets.public', (value) => ({
    ...value,
    sidebar: [{ id: 'injected', kind: 'search' as const, title: '' }],
  }));
  expect(
    (await service.getPublic()).sidebar.map((widget) => widget.id),
  ).toEqual(['one', 'two']);
});
