import { expect, test } from 'bun:test';
import { adminMenu, adminBar } from '#api/http/admin-menu';
import { AdminPageRegistry } from '#api/plugin-runtime/admin-page-registry';
import { HookBus } from '#api/plugin-runtime/hook-bus';
import { recordingLogger } from '#test/support/memory';
import { adminMenuResponseSchema } from '@cms/sdk';

test('menu metadata preserves core localization, overrides, ordering and hiding', async () => {
  const logger = recordingLogger().logger;
  const pages = new AdminPageRegistry({ timeoutMs: 100, logger });
  const hooks = new HookBus({ timeoutMs: 100, logger });
  const actor = { id: 'admin', role: 'administrator' };

  pages
    .registrar('example')
    .page('report', { title: 'Report', render: () => [] });
  const initial = adminMenuResponseSchema.parse(
    await adminMenu(actor, pages, hooks),
  );

  expect(initial.items.find((item) => item.key === 'content')).toMatchObject({
    core: true,
    labelOverridden: false,
    hidden: false,
  });
  expect(
    initial.items.find((item) => item.key === 'example:report'),
  ).toMatchObject({
    core: false,
    labelOverridden: false,
    hidden: false,
  });
  hooks.registrar('site', { trusted: true }).filter('admin.menu', (value) => ({
    ...value,
    items: value.items
      .filter((item) => item.key !== 'media' && item.key !== 'example:report')
      .map((item) =>
        item.key === 'content'
          ? { ...item, label: 'Articles', position: -10 }
          : { ...item, labelOverridden: true },
      ),
  }));
  const filtered = adminMenuResponseSchema.parse(
    await adminMenu(actor, pages, hooks),
  );

  expect(filtered.items[0]).toMatchObject({
    key: 'content',
    label: 'Articles',
    position: -10,
    core: true,
    labelOverridden: true,
    hidden: false,
  });
  expect(filtered.items.find((item) => item.key === 'media')).toMatchObject({
    core: true,
    hidden: true,
    label: 'Media',
    labelOverridden: false,
    position: initial.items.find((item) => item.key === 'media')!.position,
  });
  expect(filtered.items.some((item) => item.key === 'example:report')).toBe(
    false,
  );
  const contributor = await adminMenu(
    { id: 'writer', role: 'contributor' },
    pages,
    hooks,
  );

  expect(contributor.items.some((item) => item.key === 'media')).toBe(false);
  expect(
    (await adminBar(actor, pages, hooks)).items.some(
      (item) => item.key === 'media',
    ),
  ).toBe(false);
  expect(
    filtered.items
      .filter((item) => item.key !== 'content')
      .every((item) => !item.labelOverridden),
  ).toBe(true);
});

test('menu filters cannot forge core or hidden flags', async () => {
  const logger = recordingLogger().logger;
  const pages = new AdminPageRegistry({ timeoutMs: 100, logger });
  const hooks = new HookBus({ timeoutMs: 100, logger });
  const actor = { id: 'writer', role: 'contributor' };
  const initial = await adminMenu(actor, pages, hooks);

  for (const field of ['core', 'hidden'] as const) {
    const release = hooks
      .registrar('site', { trusted: true })
      .filter('admin.menu', (value) => {
        value.items[0]![field] = !value.items[0]![field];
        value.items[0]!.label = 'Forged label';

        return value;
      });

    expect(await adminMenu(actor, pages, hooks)).toEqual(initial);
    release();
  }
});
