import { adminMenuResponseSchema, adminBarResponseSchema, can } from '@cms/sdk';
import type { AdminMenuItem } from '@cms/sdk';
import type { Actor } from '#api/domain/auth/authorization';
import type { AdminPageRegistry } from '#api/plugin-runtime/admin-page-registry';
import type { HookDispatcher } from '#api/domain/ports';

const core = [
  ['content', 'Content', 'content.create'],
  ['media', 'Media', 'media.upload'],
  ['users', 'Users', 'users.manage'],
  ['tools', 'Tools', 'tools.manage'],
  ['settings', 'Settings', 'settings.manage'],
  ['appearance', 'Appearance', 'appearance.manage'],
  ['plugins', 'Plugins', 'plugins.manage'],
  ['comments', 'Comments', 'comments.moderate'],
] as const;

export const adminMenu = async (
  actor: Actor,
  pages: AdminPageRegistry,
  hooks?: HookDispatcher,
) => {
  const items: AdminMenuItem[] = core
    .filter(([, , capability]) => can(actor, capability))
    .map(([key, label], position) => ({
      key,
      label,
      href: `/admin/${key}`,
      parent: null,
      position,
      core: true,
      labelOverridden: false,
      hidden: false,
    }));

  items.push(...pages.menu(actor));
  items.sort((a, b) => a.position - b.position);

  if (!hooks?.has('admin.menu')) return { items };
  const result = await hooks.applyFilter(
    'admin.menu',
    { userId: actor.id, items: structuredClone(items) },
    (value) => {
      const parsed = adminMenuResponseSchema.safeParse(value);

      return (
        parsed.success &&
        (value as { userId?: unknown }).userId === actor.id &&
        new Set(parsed.data.items.map((item) => item.key)).size ===
          parsed.data.items.length &&
        parsed.data.items.every((item) =>
          items.some(
            (original) =>
              original.key === item.key &&
              original.href === item.href &&
              original.parent === item.parent &&
              original.core === item.core &&
              original.hidden === item.hidden,
          ),
        )
      );
    },
  );
  const retained = new Set(result.items.map((item) => item.key));

  return {
    items: result.items
      .map((item) => {
        const original = items.find((candidate) => candidate.key === item.key)!;

        return {
          ...item,
          core: original.core,
          labelOverridden: original.core && original.label !== item.label,
          hidden: false,
        };
      })
      .concat(
        items
          .filter((item) => item.core && !retained.has(item.key))
          .map((item) => ({ ...item, hidden: true })),
      )
      .sort((a, b) => a.position - b.position),
  };
};

export const adminBar = async (
  actor: Actor,
  pages: AdminPageRegistry,
  hooks?: HookDispatcher,
) => {
  const menu = await adminMenu(actor, pages, hooks);
  const items = menu.items
    .filter((item) => !item.hidden)
    .map(({ key, label, href }) => ({
      key,
      label,
      href,
    }));

  if (!hooks?.has('adminBar.items')) return { items };
  const result = await hooks.applyFilter(
    'adminBar.items',
    { userId: actor.id, items: structuredClone(items) },
    (value) => {
      const parsed = adminBarResponseSchema.safeParse(value);

      return (
        parsed.success &&
        (value as { userId?: unknown }).userId === actor.id &&
        new Set(parsed.data.items.map((item) => item.key)).size ===
          parsed.data.items.length &&
        parsed.data.items.every((item) =>
          items.some(
            (original) =>
              original.key === item.key && original.href === item.href,
          ),
        )
      );
    },
  );

  return { items: result.items };
};
