import { expect, test } from 'bun:test';
import { HookBus } from '#api/plugin-runtime/hook-bus';
import { PageRenderService } from '#api/plugin-runtime/page-render-service';
import { emptySlots } from '#api/plugin-runtime/slot-registry';
import type { PublicTheme } from '@cms/sdk';

test('render filters validate tokens and active templates while avoiding unused theme reads', async () => {
  const hooks = new HookBus({
    timeoutMs: 100,
    logger: { info() {}, warn() {}, error() {} },
  });
  let reads = 0;
  const service = new PageRenderService(
    { render: async () => emptySlots() },
    hooks,
    {
      getPublic: async () => {
        reads++;

        return { templates: { index: [], home: [] } } as unknown as PublicTheme;
      },
    },
  );

  await service.render({ kind: 'home' });
  expect(reads).toBe(0);
  const registrar = hooks.registrar('test');

  registrar.filter('page.bodyClasses', (value) => ({
    ...value,
    classes: ['custom-page'],
  }));
  registrar.filter('template.candidates', (value) => ({
    ...value,
    candidates: ['home', 'index'],
  }));
  registrar.filter('page.bodyClasses', (value) => ({
    ...value,
    classes: ['" onclick="alert(1)'],
  }));
  registrar.filter('template.candidates', (value) => ({
    ...value,
    candidates: ['../secret'],
  }));
  const result = await service.render({ kind: 'home' });

  expect(result.bodyClasses).toEqual(['custom-page']);
  expect(result.templateCandidates).toEqual(['home', 'index']);
  expect(reads).toBe(1);
});
