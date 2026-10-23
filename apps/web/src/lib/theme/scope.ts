import { getContext, setContext } from 'svelte';
import type { ArchivePathsState, SlotMap } from '@cms/sdk';
import type { CommentSection } from '#lib/server/comments.js';
import type { BlockData } from '#lib/server/theme-queries.js';
import type {
  MenuItemView,
  PostSummary,
  PostList,
  ReadingView,
  SiteView,
  ThemeView,
  WidgetView,
} from '#lib/server/public-view.js';
import type { ThemePage } from '#lib/theme/template.js';

/** Everything blocks may show: layout data, the page being rendered and its slots. */
export interface SiteScope {
  archives?: ArchivePathsState;
  queries?: Record<string, PostList>;
  terms: BlockData['terms'];
  months: BlockData['months'];
  /** Previous and next entry of a single entry page. */
  adjacent: BlockData['adjacent'];
  pageTree: BlockData['pageTree'];
  recentComments: BlockData['recentComments'];
  postAuthor: BlockData['postAuthor'];
  calendar: BlockData['calendar'];
  theme: ThemeView;
  site: SiteView;
  reading: ReadingView;
  menus: { primary: MenuItemView[] | null; footer: MenuItemView[] | null };
  widgets: { sidebar: WidgetView[]; footer: WidgetView[] };
  /** Navigation fallback while no primary menu is set. */
  pages: { path: string; title: string }[];
  page: ThemePage;
  slots: SlotMap | null;
  fieldLabels: { key: string; label: string; type: string }[];
  comments: CommentSection | null;
  moderation: boolean;
  /** Whether the visitor is signed in (the toolbar shows). */
  signedIn: boolean;
}

const SCOPE = Symbol('site-scope');
const POST = Symbol('post');
const PARTS = Symbol('template-parts');
const PATH = Symbol('block-path');

/**
 * Where the blocks being rendered sit in the tree the site editor edits (indexes from the
 * root); undefined outside the editor and inside template parts, which are edited separately.
 */
export const provideBlockPath = (path: number[] | undefined) =>
  setContext(PATH, path);

export const useBlockPath = () => getContext<number[] | undefined>(PATH);

export const provideScope = (scope: () => SiteScope) =>
  setContext(SCOPE, scope);

export const useScope = () => getContext<() => SiteScope>(SCOPE);

/** The post a `post-template` is repeating; single pages have none. */
export const providePost = (post: () => PostSummary) => setContext(POST, post);

export const useLoopPost = () =>
  getContext<(() => PostSummary) | undefined>(POST);

/** Template parts being rendered, outermost first, so a part cannot include itself. */
export const provideParts = (trail: string[]) => setContext(PARTS, trail);

export const useParts = () => getContext<string[] | undefined>(PARTS) ?? [];

/**
 * The post a post block shows: the repeated post inside a query loop, otherwise the entry the
 * page is about. `single` tells the two apart (only an entry page has a body and comments).
 */
export const useCurrentPost = () => {
  const loop = useLoopPost();
  const scope = useScope();
  return () => {
    if (loop) return { post: loop(), entry: null };
    const { page } = scope();
    return page.kind === 'content' || page.kind === 'preview'
      ? { post: page.content, entry: page.content }
      : { post: null, entry: null };
  };
};
