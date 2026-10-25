import { archivePath } from '@cms/sdk';
import type { MenuItemProvider } from '@cms/sdk/plugin';

/** Core menu types use exactly the same resolver contract as contributed object types. */
export const coreMenuTypes: Record<string, MenuItemProvider> = {
  home: () => ({ url: '/', title: '' }),
  custom: ({ item }) => ({ url: item.url ?? '/', title: item.url ?? '' }),
  archive: ({ item }) => ({
    url: `/archive/${item.archive}`,
    title: item.archive ?? '',
  }),
  content: ({ item, content }) => {
    const entry = content[item.contentId ?? ''];
    return entry ? { url: entry.path, title: entry.title } : null;
  },
  term: ({ item, terms, bases }) => {
    const term = terms[`${item.taxonomy}:${item.termId}`];
    if (!term) return null;
    return {
      url:
        term.taxonomy === 'category' || term.taxonomy === 'tag'
          ? archivePath(bases, term.taxonomy, term.slug)
          : `/taxonomy/${encodeURIComponent(term.taxonomy)}/${encodeURIComponent(term.slug)}`,
      title: term.name,
    };
  },
};
