import type { Block } from '@cms/sdk';
import type {
  ContentView,
  PostList,
  TermArchiveView,
} from '#lib/server/public-view.js';

/** What a public page shows, as its load returns it; templates render it through blocks. */
export type ThemePage =
  | { kind: 'content' | 'preview'; content: ContentView }
  | {
      kind: 'home';
      type: 'post' | 'article';
      posts: PostList;
      /** Set on the posts page (Settings → Reading). */
      path?: string;
      title?: string;
    }
  | { kind: 'search'; query: string; posts: PostList | null }
  | { kind: 'term'; term: TermArchiveView; posts: PostList }
  | {
      kind: 'author';
      author: { name: string; slug: string; bio: string };
      posts: PostList;
    }
  | {
      kind: 'date';
      date: { year: number; month: number | null };
      posts: PostList;
    }
  | {
      kind: 'archive';
      archive: { key: string; name: string; description: string };
      posts: PostList;
    }
  | { kind: 'error'; status: number; message: string };

// Names are only looked up in the theme's validated template record; unknown names fall through.
const suffix = (value: string) => [value];

/**
 * WordPress template hierarchy, most specific first. `front` marks the site's front page
 * (`/`), which prefers `front-page` whatever it shows.
 */
export const templateCandidates = (
  page: ThemePage,
  front = false,
): string[] => {
  const names = ((): string[] => {
    switch (page.kind) {
      case 'content':
      case 'preview': {
        const { type, slug } = page.content;
        return type === 'page'
          ? [...suffix(slug).map((s) => `page-${s}`), 'page', 'singular']
          : [
              ...suffix(`${type}-${slug}`).map((s) => `single-${s}`),
              ...suffix(type).map((s) => `single-${s}`),
              'single',
              'singular',
            ];
      }
      case 'home':
        return ['home'];
      case 'search':
        return ['search'];
      case 'term':
        if (page.term.taxonomy !== 'category' && page.term.taxonomy !== 'tag')
          return [
            `taxonomy-${page.term.taxonomy}-${page.term.slug}`,
            `taxonomy-${page.term.taxonomy}`,
            'archive',
          ];
        return [
          ...suffix(page.term.slug).map((s) => `${page.term.taxonomy}-${s}`),
          page.term.taxonomy,
          'archive',
        ];
      case 'author':
        return [
          ...suffix(page.author.slug).map((s) => `author-${s}`),
          'author',
          'archive',
        ];
      case 'date':
        return ['date', 'archive'];
      case 'archive':
        return [
          ...suffix(page.archive.key).map((s) => `archive-${s}`),
          'archive',
        ];
      case 'error':
        return page.status === 404 ? ['404'] : [];
    }
  })();
  return [...(front ? ['front-page'] : []), ...names, 'index'];
};

/** The first template of the hierarchy the theme has; every theme has `index`. */
export const pickTemplate = (
  templates: Record<string, Block[]>,
  candidates: string[],
): Block[] => {
  for (const name of candidates) {
    const blocks = templates[name];
    if (blocks) return blocks;
  }
  return [];
};
