import {
  CORE_WIDGETS,
  LINK,
  MEDIA_IMAGE,
  WIDGET_AREAS,
  widgetsSettingsSchema,
} from '@cms/sdk';
import { richText } from '#api/domain/appearance/rich-text';
import { readCache } from '#api/domain/appearance/read-cache';
import type {
  PublicWidget,
  PublicWidgets,
  Widget,
  WidgetsSettings,
} from '@cms/sdk';
import { childrenOf } from '@cms/sdk/tree';
import type { Actor } from '#api/domain/auth/authorization';
import { authorize } from '#api/domain/auth/authorization';
import type { MenuService } from '#api/domain/appearance/menu-service';
import type { PublishedContentRepository } from '#api/domain/content/published-content-repository';
import type { SettingsRepository } from '#api/domain/site/site-service';
import type {
  CountedTermRecord,
  TaxonomyRepository,
} from '#api/domain/taxonomy/taxonomy-repository';
import { invalidInput, Errors } from '#api/shared/errors';
import { parseInput } from '#api/shared/validation';
import type { HookDispatcher } from '#api/domain/ports';

const KEY = 'widgets';

/** Recent approved comments, newest first; supplied by the comments module. */
export interface RecentComments {
  recent(
    limit: number,
  ): Promise<{ author: string; title: string; path: string }[]>;
}

/** Widgets contributed by plugins, rendered to HTML. */
export interface PluginWidgets {
  types(): { type: string; name: string }[];
  render(
    type: string,
    settings: Record<string, unknown>,
  ): Promise<string | null>;
}

const count = (settings: Record<string, unknown>, fallback = 5) => {
  const value = Number(settings.count);
  return Number.isInteger(value) ? Math.min(Math.max(value, 1), 30) : fallback;
};

/** Terms in tree order with their depth; counts include only published content. */
const ordered = (terms: readonly CountedTermRecord[], flat: boolean) => {
  if (flat) return terms.map((term) => ({ ...term, depth: 0 }));
  const children = childrenOf(terms);
  const ids = new Set(terms.map((term) => term.id));
  const result: (CountedTermRecord & { depth: number })[] = [];
  const seen = new Set<string>();
  const visit = (term: CountedTermRecord, depth: number) => {
    if (seen.has(term.id)) return;
    seen.add(term.id);
    result.push({ ...term, depth });
    for (const child of children.get(term.id) ?? []) visit(child, depth + 1);
  };
  for (const term of terms)
    if (!term.parentId || !ids.has(term.parentId)) visit(term, 0);
  return result;
};

/** Sidebar and footer widgets (WordPress "Appearance → Widgets"). */
export class WidgetService {
  constructor(
    private readonly deps: {
      settings: SettingsRepository;
      hooks?: HookDispatcher;
      published: Pick<PublishedContentRepository, 'summaries' | 'months'>;
      terms: Pick<TaxonomyRepository, 'list'>;
      menus: Pick<MenuService, 'publicItems'>;
      comments: RecentComments;
      plugins: PluginWidgets;
    },
  ) {}

  async get(actor: Actor): Promise<WidgetsSettings> {
    authorize(actor, 'appearance.manage');
    return this.stored();
  }

  /** Widget types to offer: the core ones and those of active plugins. */
  types(actor: Actor) {
    authorize(actor, 'appearance.manage');
    return {
      core: [...CORE_WIDGETS],
      plugins: this.deps.plugins.types(),
    };
  }

  /** Replaces both areas. Types must be core widgets or plugin widgets (`plugin:` prefix). */
  async update(input: unknown, actor: Actor): Promise<WidgetsSettings> {
    authorize(actor, 'appearance.manage');
    const initial = parseInput(widgetsSettingsSchema, input);
    const settings = widgetsSettingsSchema.parse(
      (await this.deps.hooks?.applyFilter(
        'widgets.beforeSave',
        initial,
        (value) => widgetsSettingsSchema.safeParse(value).success,
      )) ?? initial,
    );
    for (const area of WIDGET_AREAS)
      settings[area].forEach((widget, index) => {
        if (
          !(CORE_WIDGETS as readonly string[]).includes(widget.type) &&
          !widget.type.startsWith('plugin:')
        )
          throw invalidInput(Errors.WidgetTypeUnknown, [
            {
              path: `${area}.${index}.type`,
              message: Errors.WidgetTypeUnknown,
            },
          ]);
      });
    await this.deps.settings.set(KEY, settings);
    void this.deps.hooks?.emit('widgets.updated', settings);
    return settings;
  }

  /** Both areas ready to display. A widget whose data cannot be read is left out. */
  async getPublic(): Promise<PublicWidgets> {
    const settings = await this.stored();
    const once = readCache();
    const [sidebar, footer] = await Promise.all(
      WIDGET_AREAS.map(async (area) =>
        (
          await Promise.all(
            settings[area].map((widget) =>
              this.present(widget, once).catch(() => null),
            ),
          )
        ).filter((widget) => widget !== null),
      ),
    );
    return { sidebar: sidebar!, footer: footer! };
  }

  private async present(
    widget: Widget,
    once: <T>(key: string, read: () => Promise<T>) => Promise<T>,
  ): Promise<PublicWidget | null> {
    const base = { id: widget.id, title: widget.title };
    const { settings } = widget;
    switch (widget.type) {
      case 'recentPosts': {
        const amount = count(settings);
        const { items } = await once(`posts:${amount}`, () =>
          this.deps.published.summaries({
            type: 'post',
            page: 1,
            pageSize: amount,
          }),
        );
        return {
          ...base,
          kind: 'recentPosts',
          posts: items.map((item) => ({
            title: item.title,
            path: item.path,
            publishedAt: (item.publishedAt ?? item.updatedAt).toISOString(),
          })),
        };
      }
      case 'categories':
      case 'tags': {
        const taxonomy = widget.type === 'categories' ? 'category' : 'tag';
        const terms = (
          await once(`terms:${taxonomy}`, () =>
            this.deps.terms.list(taxonomy, 'published'),
          )
        ).filter((term) => term.count > 0 || settings.showEmpty === true);
        const shown = ordered(
          terms,
          taxonomy === 'tag' || settings.flat === true,
        );
        return {
          ...base,
          kind: widget.type,
          terms: shown
            .slice(0, taxonomy === 'tag' ? count(settings, 30) : undefined)
            .map(({ name, slug, count: total, depth }) => ({
              name,
              slug,
              count: total,
              depth,
            })),
        };
      }
      case 'search':
        return { ...base, kind: 'search' };
      case 'text': {
        const text = typeof settings.text === 'string' ? settings.text : '';
        return { ...base, kind: 'text', text, paragraphs: richText(text) };
      }
      case 'image': {
        // Only media-library images; an image without one is left out.
        const src = typeof settings.src === 'string' ? settings.src : '';
        if (!MEDIA_IMAGE.test(src)) return null;
        const link = typeof settings.link === 'string' ? settings.link : '';
        return {
          ...base,
          kind: 'image',
          src,
          alt:
            typeof settings.alt === 'string' ? settings.alt.slice(0, 300) : '',
          link: LINK.test(link) ? link : null,
        };
      }
      case 'menu': {
        const items =
          typeof settings.menuId === 'string'
            ? await once(`menu:${settings.menuId}`, () =>
                this.deps.menus.publicItems(settings.menuId as string),
              )
            : null;
        return items && { ...base, kind: 'menu', items };
      }
      case 'archives':
        // Date archives list posts, as in WordPress.
        return {
          ...base,
          kind: 'archives',
          months: await once(`months:${count(settings, 12)}`, () =>
            this.deps.published.months(['post'], count(settings, 12)),
          ),
        };
      case 'recentComments':
        return {
          ...base,
          kind: 'recentComments',
          comments: await once(`comments:${count(settings)}`, () =>
            this.deps.comments.recent(count(settings)),
          ),
        };
      default: {
        const html = await this.deps.plugins.render(widget.type, settings);
        return html === null ? null : { ...base, kind: 'html', html };
      }
    }
  }

  private async stored(): Promise<WidgetsSettings> {
    const result = widgetsSettingsSchema.safeParse(
      await this.deps.settings.get(KEY),
    );
    return result.success ? result.data : widgetsSettingsSchema.parse({});
  }
}
