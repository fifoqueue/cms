import { expect, test } from 'bun:test';
import { PageRenderService } from '#api/plugin-runtime/page-render-service';
import { emptySlots } from '#api/plugin-runtime/slot-registry';

test('page renders share in-flight work only for the same request and normalized query', async () => {
  let renders = 0;
  const service = new PageRenderService({
    render: async () => {
      renders++;

      return emptySlots();
    },
  });
  const request = {};

  await Promise.all([
    service.render({ kind: 'home' }, request),
    service.render({ path: '/', kind: 'home' }, request),
  ]);
  expect(renders).toBe(1);
  await service.render({ kind: 'search' }, request);
  await service.render({ kind: 'home' }, {});
  expect(renders).toBe(3);
});
