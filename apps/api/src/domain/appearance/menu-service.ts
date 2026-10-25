import { publicMenuItemSchema } from '@cms/sdk';
import type { MenuResolution, MenuLink } from '@cms/sdk/plugin';
import { coreMenuTypes } from '#api/domain/appearance/menu-types';
import type { HookDispatcher } from '#api/domain/ports';
import { readCache } from '#api/domain/appearance/read-cache';
import type { ArchivePathsService } from '#api/domain/permalinks/archive-paths';
import { MENU_LOCATIONS, menusSettingsSchema } from '@cms/sdk';
import type {
  MenuTarget,
  MenuItem,
  MenuLocation,
  MenusSettings,
  PublicMenuItem,
} from '@cms/sdk';
import type { Actor } from '#api/domain/auth/authorization';
import { authorize } from '#api/domain/auth/authorization';
import type { PublishedContentRepository } from '#api/domain/content/published-content-repository';
import type { TaxonomyRepository } from '#api/domain/taxonomy/taxonomy-repository';
import type { SettingsRepository } from '#api/domain/site/site-service';
import { parseInput } from '#api/shared/validation';
import type { MenuObjectQuery } from '@cms/sdk';
import type { z } from 'zod';
import type { menuItemTypeSchema, menuObjectsSchema } from '@cms/sdk';
import type { TaxonomyTypeService } from '#api/domain/taxonomy/taxonomy-types';

const KEY = 'menus';

const walk = (items: readonly MenuItem[]): MenuItem[] =>
  items.flatMap((item) => [item, ...walk(item.children)]);

/** Navigation menus and the locations themes show them in. */
export class MenuService {
  constructor(
    private readonly deps: {
      settings: SettingsRepository;
      hooks?: HookDispatcher;
      itemTypes?: {
        resolve(query: MenuResolution, key: string): Promise<MenuLink | null>;
        types?(): z.output<typeof menuItemTypeSchema>[];
        objects?(
          key: string,
          query: MenuObjectQuery,
        ): Promise<z.output<typeof menuObjectsSchema>>;
      };
      taxonomyTypes?: Pick<TaxonomyTypeService, 'list'>;
      archives?: Pick<ArchivePathsService, 'get'>;
      published: Pick<PublishedContentRepository, 'summariesByIds'>;
      terms: Pick<TaxonomyRepository, 'list'>;
    },
  ) {}

  async get(actor: Actor): Promise<MenusSettings> {
    authorize(actor, 'appearance.manage');
    return this.stored();
  }

  types(actor: Actor) {
    authorize(actor, 'appearance.manage');
    return this.deps.itemTypes?.types?.() ?? [];
  }

  async objects(key: string, query: MenuObjectQuery, actor: Actor) {
    authorize(actor, 'appearance.manage');
    return (
      (await this.deps.itemTypes?.objects?.(key, query)) ?? {
        items: [],
        total: 0,
      }
    );
  }

  /**
   * Labels for the menu editor: the published entries the saved menus link to (unpublished ones
   * stay unnamed). Needs only `appearance.manage`, read in chunks from the published projection.
   */
  async targets(actor: Actor): Promise<MenuTarget[]> {
    authorize(actor, 'appearance.manage');
    const settings = await this.stored();
    const ids = [
      ...new Set(
        settings.menus
          .flatMap((menu) => walk(menu.items))
          .flatMap((item) =>
            item.kind === 'content' && item.contentId ? [item.contentId] : [],
          ),
      ),
    ];
    const found: MenuTarget[] = [];
    for (let start = 0; start < ids.length; start += 500)
      for (const {
        id,
        title,
        type,
      } of await this.deps.published.summariesByIds(
        ids.slice(start, start + 500),
      ))
        found.push({ id, title, type });
    return found;
  }

  /** Replaces every menu and location assignment at once. Unknown menus at a location are cleared. */
  async update(input: unknown, actor: Actor): Promise<MenusSettings> {
    authorize(actor, 'appearance.manage');
    const initial = parseInput(menusSettingsSchema, input);
    const settings = menusSettingsSchema.parse(
      (await this.deps.hooks?.applyFilter(
        'menu.beforeSave',
        initial,
        (value) => menusSettingsSchema.safeParse(value).success,
      )) ?? initial,
    );
    const previous = await this.stored();
    const ids = new Set(settings.menus.map((menu) => menu.id));
    const locations = Object.fromEntries(
      Object.entries(settings.locations).map(([location, id]) => [
        location,
        id && ids.has(id) ? id : null,
      ]),
    ) as MenusSettings['locations'];
    const saved = { ...settings, locations };
    await this.deps.settings.set(KEY, saved);
    for (const menu of saved.menus) {
      const before = previous.menus.find((entry) => entry.id === menu.id);
      if (!before || JSON.stringify(before) !== JSON.stringify(menu))
        void this.deps.hooks?.emit(
          before ? 'menu.updated' : 'menu.created',
          menu,
        );
    }
    for (const menu of previous.menus)
      if (!saved.menus.some((entry) => entry.id === menu.id))
        void this.deps.hooks?.emit('menu.deleted', menu);
    return saved;
  }

  /**
   * The menu at `location` with resolved links; items whose target is not public (a draft, a
   * deleted term) are left out with their children.
   */
  async publicMenu(location: MenuLocation): Promise<PublicMenuItem[] | null> {
    const settings = await this.stored();
    const id = settings.locations[location];
    return id ? this.publicItems(id, settings) : null;
  }

  /** Both theme locations from one settings read. */
  async publicLocations() {
    const settings = await this.stored();
    const once = readCache();
    const [primary, footer] = await Promise.all(
      MENU_LOCATIONS.map((location) => {
        const id = settings.locations[location];
        return id ? this.publicItems(id, settings, once) : null;
      }),
    );
    return { primary, footer };
  }

  /** The menu `id` with resolved links, like `publicMenu`; null when it does not exist. */
  async publicItems(
    id: string,
    settings?: MenusSettings,
    once: <T>(key: string, read: () => Promise<T>) => Promise<T> = (
      _key,
      read,
    ) => read(),
  ): Promise<PublicMenuItem[] | null> {
    const menu = (settings ?? (await this.stored())).menus.find(
      (entry) => entry.id === id,
    );
    if (!menu) return null;

    const items = walk(menu.items);
    const contentIds = items.flatMap((item) =>
      item.kind === 'content' && item.contentId ? [item.contentId] : [],
    );
    const registered = new Set(
      (
        (await this.deps.taxonomyTypes?.list()) ?? [
          { key: 'category' },
          { key: 'tag' },
        ]
      ).map((type) => type.key),
    );
    const taxonomies = [
      ...new Set(
        items.flatMap((item) =>
          item.kind === 'term' && item.taxonomy && registered.has(item.taxonomy)
            ? [item.taxonomy]
            : [],
        ),
      ),
    ];
    const [entries, groups] = await Promise.all([
      this.deps.published.summariesByIds(contentIds),
      Promise.all(
        taxonomies.map((taxonomy) =>
          once(`terms:${taxonomy}`, () =>
            this.deps.terms.list(taxonomy, 'published'),
          ),
        ),
      ),
    ]);
    const bases = (await this.deps.archives?.get())?.bases ?? {
      category: '/category',
      tag: '/tag',
    };
    const content = Object.fromEntries(
      entries.map((entry) => [
        entry.id,
        { path: entry.path, title: entry.title },
      ]),
    );
    const terms = Object.fromEntries(
      groups
        .flat()
        .map((term) => [
          `${term.taxonomy}:${term.id}`,
          { taxonomy: term.taxonomy, slug: term.slug, name: term.name },
        ]),
    );

    const resolve = async (item: MenuItem): Promise<PublicMenuItem | null> => {
      if (
        item.kind === 'plugin' &&
        item.provider &&
        item.provider in coreMenuTypes
      )
        return null;
      const query = { item, content, terms, bases };
      const key = item.kind === 'plugin' ? item.provider! : item.kind;
      const link = this.deps.itemTypes
        ? await this.deps.itemTypes.resolve(query, key)
        : await coreMenuTypes[key]?.(query);
      if (!link) return null;
      return {
        label: item.label || link.title,
        url: link.url,
        newTab: item.newTab,
        children: (await Promise.all(item.children.map(resolve))).filter(
          (child) => child !== null,
        ),
      };
    };
    const output = (await Promise.all(menu.items.map(resolve))).filter(
      (item) => item !== null,
    );
    const filtered = await this.deps.hooks?.applyFilter(
      'menu.items',
      output,
      (value) => publicMenuItemSchema.array().safeParse(value).success,
    );
    return publicMenuItemSchema.array().parse(filtered ?? output);
  }

  private async stored(): Promise<MenusSettings> {
    const result = menusSettingsSchema.safeParse(
      await this.deps.settings.get(KEY),
    );
    return result.success ? result.data : menusSettingsSchema.parse({});
  }
}
