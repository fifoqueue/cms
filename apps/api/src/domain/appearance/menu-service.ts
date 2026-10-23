import { archivePath } from '@cms/sdk';
import type { ArchivePathsService } from '#api/domain/permalinks/archive-paths';
import { MENU_LOCATIONS, menusSettingsSchema } from '@cms/sdk';
import type {
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

const KEY = 'menus';

const walk = (items: readonly MenuItem[]): MenuItem[] =>
  items.flatMap((item) => [item, ...walk(item.children)]);

/** Navigation menus and the locations themes show them in. */
export class MenuService {
  constructor(
    private readonly deps: {
      settings: SettingsRepository;
      archives?: Pick<ArchivePathsService, 'get'>;
      published: Pick<PublishedContentRepository, 'summariesByIds'>;
      terms: Pick<TaxonomyRepository, 'list'>;
    },
  ) {}

  async get(actor: Actor): Promise<MenusSettings> {
    authorize(actor, 'appearance.manage');
    return this.stored();
  }

  /** Replaces every menu and location assignment at once. Unknown menus at a location are cleared. */
  async update(input: unknown, actor: Actor): Promise<MenusSettings> {
    authorize(actor, 'appearance.manage');
    const settings = parseInput(menusSettingsSchema, input);
    const ids = new Set(settings.menus.map((menu) => menu.id));
    const locations = Object.fromEntries(
      Object.entries(settings.locations).map(([location, id]) => [
        location,
        id && ids.has(id) ? id : null,
      ]),
    ) as MenusSettings['locations'];
    const saved = { ...settings, locations };
    await this.deps.settings.set(KEY, saved);
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
    const cached = new Map<string, Promise<unknown>>();
    const once = <T>(key: string, read: () => Promise<T>): Promise<T> => {
      const existing = cached.get(key);
      if (existing) return existing as Promise<T>;
      const value = read();
      cached.set(key, value);
      return value;
    };
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
    const usesTerms = items.some((item) => item.kind === 'term');
    const [entries, categories, tags] = await Promise.all([
      this.deps.published.summariesByIds(contentIds),
      usesTerms
        ? once('terms:category', () =>
            this.deps.terms.list('category', 'published'),
          )
        : [],
      usesTerms
        ? once('terms:tag', () => this.deps.terms.list('tag', 'published'))
        : [],
    ]);
    const bases = (await this.deps.archives?.get())?.bases ?? {
      category: '/category',
      tag: '/tag',
    };
    const content = new Map(entries.map((entry) => [entry.id, entry]));
    const terms = new Map(
      [...categories, ...tags].map((term) => [
        `${term.taxonomy}:${term.id}`,
        term,
      ]),
    );

    const resolve = (item: MenuItem): PublicMenuItem | null => {
      let url: string;
      let title: string;
      switch (item.kind) {
        case 'home':
          [url, title] = ['/', ''];
          break;
        case 'custom':
          [url, title] = [item.url ?? '/', item.url ?? ''];
          break;
        case 'archive':
          [url, title] = [`/archive/${item.archive}`, item.archive ?? ''];
          break;
        case 'content': {
          const entry = content.get(item.contentId ?? '');
          if (!entry) return null;
          [url, title] = [entry.path, entry.title];
          break;
        }
        case 'term': {
          const term = terms.get(`${item.taxonomy}:${item.termId}`);
          if (!term) return null;
          [url, title] = [
            term.taxonomy === 'category' || term.taxonomy === 'tag'
              ? archivePath(bases, term.taxonomy, term.slug)
              : `/taxonomy/${encodeURIComponent(term.taxonomy)}/${encodeURIComponent(term.slug)}`,
            term.name,
          ];
          break;
        }
      }
      return {
        label: item.label || title,
        url,
        newTab: item.newTab,
        children: item.children.flatMap((child) => resolve(child) ?? []),
      };
    };
    return menu.items.flatMap((item) => resolve(item) ?? []);
  }

  private async stored(): Promise<MenusSettings> {
    const result = menusSettingsSchema.safeParse(
      await this.deps.settings.get(KEY),
    );
    return result.success ? result.data : menusSettingsSchema.parse({});
  }
}
