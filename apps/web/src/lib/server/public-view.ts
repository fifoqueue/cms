// Public page data. Every field sent to the browser is listed here explicitly, so nothing the
// API adds later (or any admin-only field) reaches public pages without a deliberate change.
import type {
  Paginated,
  PublicContent,
  PublicContentSummary,
  PublicEntrySeo,
  PublicImage,
  PublicSeoSettings,
  PublicSiteDto,
  PublicTaxonomyTerm,
  PublicTheme,
  PublicMenuItem,
  PublicReading,
  PublicWidget,
  PublicWidgets,
  TermSummary,
} from '@cms/sdk';
import { PAGINATION_MAX_PAGE } from '@cms/sdk';
import type { HomeListType } from '#lib/theme/pagination.js';

/** A public image with its responsive sizes. */
export const imageView = (image: PublicImage) => ({
  url: image.url,
  alt: image.alt,
  width: image.width,
  height: image.height,
  sizes: image.sizes.map(({ url, width }) => ({ url, width })),
});

export const siteView = ({
  title,
  description,
  locale,
  icon,
  logo,
}: PublicSiteDto) => ({
  title,
  description,
  locale,
  icon: icon && imageView(icon),
  logo: logo && imageView(logo),
});

/** Site-wide settings the public `<head>` uses; AI/llms.txt prose stays with the discovery routes. */
export const seoSettingsView = (settings: PublicSeoSettings) => ({
  siteUrl: settings.siteUrl,
  titleTemplate: settings.titleTemplate,
  homeTitle: settings.homeTitle,
  homeDescription: settings.homeDescription,
  defaultImageUrl: settings.defaultImageUrl,
  defaultImageAlt: settings.defaultImageAlt,
  entityType: settings.entityType,
  entityName: settings.entityName,
  logoUrl: settings.logoUrl,
  sameAs: [...settings.sameAs],
  twitterHandle: settings.twitterHandle,
  indexingEnabled: settings.indexingEnabled,
  indexCategories: settings.indexCategories,
  indexTags: settings.indexTags,
  llmsTxtEnabled: settings.llmsTxtEnabled,
  googleVerification: settings.googleVerification,
  bingVerification: settings.bingVerification,
  maxSnippet: settings.maxSnippet,
  maxImagePreview: settings.maxImagePreview,
  maxVideoPreview: settings.maxVideoPreview,
});

/** Published per-entry metadata of content and terms. */
export const entrySeoView = (seo: PublicEntrySeo) => ({
  title: seo.title,
  description: seo.description,
  canonicalUrl: seo.canonicalUrl,
  noIndex: seo.noIndex,
  noFollow: seo.noFollow,
  imageUrl: seo.imageUrl,
  imageAlt: seo.imageAlt,
  socialTitle: seo.socialTitle,
  socialDescription: seo.socialDescription,
  schemaType: seo.schemaType,
  authorName: seo.authorName,
  authorUrl: seo.authorUrl,
});

/** The theme as the site renders it: the validated public DTO, field by field. */
export const themeView = ({
  id,
  name,
  settings,
  styles,
  templates,
  parts,
  css,
  preview,
}: PublicTheme) => ({
  id,
  name,
  settings,
  styles,
  templates,
  parts,
  css,
  preview,
});

export type ThemeView = ReturnType<typeof themeView>;

export const termLink = ({ id, name, slug }: TermSummary) => ({
  id,
  name,
  slug,
});

export const termView = ({
  id,
  taxonomy,
  name,
  slug,
  description,
  parentId,
  count,
}: PublicTaxonomyTerm) => ({
  id,
  taxonomy,
  name,
  slug,
  description,
  parentId,
  count,
});

/** A term with its archive metadata; only the archive page itself needs `seo`. */
export const termArchiveView = (term: PublicTaxonomyTerm) => ({
  ...termView(term),
  seo: entrySeoView(term.seo),
});

/** Content is linked by its permalink `path` (already percent-encoded), never by `slug`. */
export const pageLink = ({ path, title }: PublicContentSummary) => ({
  path,
  title,
});

/** A listed post: everything the archive views show, without the body. */
export const summaryView = (content: PublicContentSummary) => ({
  id: content.id,
  type: content.type,
  slug: content.slug,
  path: content.path,
  title: content.title,
  excerpt: content.excerpt,
  publishedAt: content.publishedAt,
  extraTerms: content.extraTerms.map(({ id, name, slug, taxonomy }) => ({
    id,
    name,
    slug,
    taxonomy,
  })),
  categories: content.categories.map(termLink),
  tags: content.tags.map(termLink),
  author: content.author && {
    name: content.author.name,
    slug: content.author.slug,
  },
  sticky: content.sticky,
  commentCount: content.commentCount,
  protected: content.protected,
  featuredImage: content.featuredImage && imageView(content.featuredImage),
});

/** A single published entry with its API-rendered body. */
export const contentView = (content: PublicContent) => ({
  ...summaryView(content),
  /** Public custom fields; image fields are public images. */
  fields: structuredClone(content.fields),
  html: content.html,
  updatedAt: content.updatedAt,
  seo: entrySeoView(content.seo),
});

export const listView = ({
  items,
  total,
  page,
  pageSize,
}: Paginated<PublicContentSummary>) => ({
  items: items.map(summaryView),
  total,
  page,
  pageSize,
});

export type SiteView = ReturnType<typeof siteView>;
export type SeoSettingsView = ReturnType<typeof seoSettingsView>;
export type EntrySeoView = ReturnType<typeof entrySeoView>;
export type TermArchiveView = ReturnType<typeof termArchiveView> & {
  path?: string;
};
export type ContentView = ReturnType<typeof contentView>;
export type PostSummary = ReturnType<typeof summaryView>;
export type PostList = ReturnType<typeof listView>;

/** `?page=` as a positive integer (1 when missing or invalid). */
export const pageParam = (url: URL) => {
  const page = Math.trunc(Number(url.searchParams.get('page')));
  return Number.isSafeInteger(page) && page > 0
    ? Math.min(page, PAGINATION_MAX_PAGE)
    : 1;
};

/** `?type=article` lists articles on the home page; anything else lists posts. */
export const homeTypeParam = (url: URL): HomeListType =>
  url.searchParams.get('type') === 'article' ? 'article' : 'post';

/** What public pages need from the reading settings. */
export type ReadingView = ReturnType<typeof readingView>;

export const readingView = (reading: PublicReading) => ({
  postsPerPage: reading.postsPerPage,
  dateFormat: reading.dateFormat,
  timeZone: reading.timeZone,
  frontPagePath: reading.frontPagePath,
  postsPagePath: reading.postsPagePath,
});

export interface MenuItemView {
  label: string;
  url: string;
  newTab: boolean;
  children: MenuItemView[];
}

export const menuView = (items: readonly PublicMenuItem[]): MenuItemView[] =>
  items.map(({ label, url, newTab, children }) => ({
    label,
    url,
    newTab,
    children: menuView(children),
  }));

const widgetView = (widget: PublicWidget) => {
  const base = { id: widget.id, title: widget.title };
  switch (widget.kind) {
    case 'recentPosts':
      return {
        ...base,
        kind: widget.kind,
        posts: widget.posts.map(({ title, path, publishedAt }) => ({
          title,
          path,
          publishedAt,
        })),
      };
    case 'categories':
    case 'tags':
      return {
        ...base,
        kind: widget.kind,
        terms: widget.terms.map(({ name, slug, count, depth }) => ({
          name,
          slug,
          count,
          depth,
        })),
      };
    case 'search':
      return { ...base, kind: widget.kind };
    case 'text':
      return { ...base, kind: widget.kind, text: widget.text };
    case 'menu':
      return { ...base, kind: widget.kind, items: menuView(widget.items) };
    case 'archives':
      return {
        ...base,
        kind: widget.kind,
        months: widget.months.map(({ year, month, count }) => ({
          year,
          month,
          count,
        })),
      };
    case 'recentComments':
      return {
        ...base,
        kind: widget.kind,
        comments: widget.comments.map(({ author, title, path }) => ({
          author,
          title,
          path,
        })),
      };
    case 'html':
      return { ...base, kind: widget.kind, html: widget.html };
  }
};

export const widgetsView = ({ sidebar, footer }: PublicWidgets) => ({
  sidebar: sidebar.map(widgetView),
  footer: footer.map(widgetView),
});

export type WidgetView = ReturnType<typeof widgetView>;
