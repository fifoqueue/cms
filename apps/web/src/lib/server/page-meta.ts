import { hasBreadcrumbs, headMeta, sitePage } from '#lib/seo/head.js';
import type { ArchivePathsState, Block, PublicImage } from '@cms/sdk';
import { loadSiteMessages } from '#lib/i18n/site.js';
import type { SiteCatalog } from '#lib/i18n/site.js';
import type { SeoMeta } from '#lib/seo/head.js';
import type { SeoSettingsView, SiteView } from '#lib/server/public-view.js';
import { filterDiscovery, filtersAvailable } from '#lib/server/seo-filter.js';
import type { FilterEvent, FilterInput } from '#lib/server/seo-filter.js';

/** What the site layout loads that the head is built from. */
export interface HeadLayout {
  site: SiteView;
  seo: SeoSettingsView;
  siteCatalog: SiteCatalog;
  displayLocale: string;
  archives?: ArchivePathsState;
}

/**
 * Page data with `seoMeta`: the page's `seo.meta` filter result when a plugin changed it,
 * otherwise null (the layout then builds the head as before, without sending it twice).
 */
export const withSeoMeta = async <T extends object>(
  event: FilterEvent,
  /** The layout data, or a function reading it only when filtering runs. */
  layout: HeadLayout | Promise<HeadLayout> | (() => Promise<HeadLayout>),
  data: T,
): Promise<T & { seoMeta: SeoMeta | null }> => {
  const page = sitePage(data as Record<string, unknown>);

  // Without a frontend proof there is nothing to filter; the layout builds the head as is.
  if (!page || !filtersAvailable()) return { ...data, seoMeta: null };
  const { site, seo, siteCatalog, displayLocale, archives } =
    await (typeof layout === 'function' ? layout() : layout);
  const value = headMeta(
    {
      site,
      locale: displayLocale,
      settings: seo,
      page,
      archiveBases: archives?.bases,
      images: (data as { images?: Record<string, PublicImage> }).images,
      breadcrumbsVisible: hasBreadcrumbs(
        (data as { template?: Block[] }).template,
        (data as { parts?: { blocks: Block[] }[] }).parts,
      ),
    },
    await loadSiteMessages(siteCatalog),
  );
  const [filtered] = await filterDiscovery(event, [
    { kind: 'seo.meta', value } as FilterInput,
  ]);

  return {
    ...data,
    seoMeta:
      JSON.stringify(filtered) === JSON.stringify(value)
        ? null
        : (filtered as SeoMeta),
  };
};
