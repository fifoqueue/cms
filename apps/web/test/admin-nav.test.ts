// Regression guard: the menu response arranges core sections (hidden, ordered, relabelled only
// on request) and places registered entries without duplicating core ones.
import { expect, test } from 'bun:test';
import type { AdminMenuItem } from '@cms/sdk';

Bun.plugin({
  name: 'admin-nav-env',
  setup(build) {
    build.module('$app/paths', () => ({
      exports: { resolve: (path: string) => path.replace('/(app)', '') },
      loader: 'object',
    }));
    build.onResolve({ filter: /^@lucide\/svelte\/icons\// }, ({ path }) => ({
      path,
      namespace: 'icon',
    }));
    build.onLoad({ filter: /.*/, namespace: 'icon' }, () => ({
      contents: 'export default {};',
      loader: 'js',
    }));
  },
});

const { adminSections, visibleSections } =
  await import('#lib/admin/admin-nav.js');
const { en } = await import('#lib/i18n/en.js');

const admin = { role: 'administrator' };

const core = (
  key: string,
  position: number,
  label = key,
  labelOverridden = false,
  hidden = false,
): AdminMenuItem => ({
  key,
  label,
  href: `/admin/${key}`,
  parent: null,
  position,
  core: true,
  labelOverridden,
  hidden,
});

const shown = (extensions: AdminMenuItem[]) =>
  visibleSections(adminSections({}), admin, [], extensions).map((section) => [
    section.key,
    section.label(en),
  ]);

test('without menu entries the core sections keep their order and labels', () => {
  expect(shown([])).toEqual([
    ['dashboard', en.dashboard],
    ['content', en.navContent],
    ['media', en.navMedia],
    ['comments', en.navComments],
    ['appearance', en.navAppearance],
    ['plugins', en.navPlugins],
    ['users', en.navUsers],
    ['tools', en.navTools],
    ['seo', en.navSeo],
    ['settings', en.navSettings],
  ]);
});

test('core entries hide, reorder and relabel only when overridden', () => {
  expect(
    shown([
      core('settings', 0, 'Site setup', true),
      core('content', 1, 'Content'),
      core('tools', 2, 'Tools'),
      core('media', 3, 'Media'),
      core('users', 4, 'People', false),
      core('appearance', 5, 'Appearance'),
      core('plugins', 6, 'Plugins'),
      core('comments', 7, 'Comments', false, true),
      {
        key: 'example:report',
        label: 'Report',
        href: '/admin/extensions/example/report',
        parent: null,
        position: 1,
        core: false,
        labelOverridden: false,
        hidden: false,
      },
    ]),
  ).toEqual([
    ['dashboard', en.dashboard],
    ['extension-example:report', 'Report'],
    ['settings', 'Site setup'],
    ['content', en.navContent],
    ['tools', en.navTools],
    ['media', en.navMedia],
    ['users', en.navUsers],
    ['appearance', en.navAppearance],
    ['seo', en.navSeo],
    ['plugins', en.navPlugins],
  ]);
});

test('a section the response omits stays even when the user holds its capability', () => {
  expect(shown([core('media', 0), core('content', 1)])).toEqual([
    ['dashboard', en.dashboard],
    ['media', en.navMedia],
    ['content', en.navContent],
    ['comments', en.navComments],
    ['appearance', en.navAppearance],
    ['plugins', en.navPlugins],
    ['users', en.navUsers],
    ['tools', en.navTools],
    ['seo', en.navSeo],
    ['settings', en.navSettings],
  ]);
});

test('sections absent from the response keep their own gating; only hidden ones go', () => {
  const author = { role: 'author' };
  const hrefs = (extensions: AdminMenuItem[]) =>
    visibleSections(adminSections({}), author, [], extensions).map(
      (section) => [section.key, section.items.map(({ href }) => href)],
    );
  const before = hrefs([]);
  const after = hrefs([core('media', 0), core('content', 1)]);
  const flat = (sections: typeof before) =>
    sections.flatMap(([, items]) => items as string[]);

  expect(flat(before)).toContain('/admin/account');
  expect(flat(before)).toContain('/admin/patterns');
  expect(after.map(([key]) => key)).toEqual(
    before.map(([key]) =>
      key === 'content' ? 'media' : key === 'media' ? 'content' : key,
    ),
  );
  expect(flat(after).sort()).toEqual(flat(before).sort());
  expect(
    hrefs([core('content', 0), core('media', 1, 'Media', false, true)])
      .map(([key]) => key)
      .includes('media'),
  ).toBe(false);
});
