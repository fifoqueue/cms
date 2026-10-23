<script lang="ts">
  import { walkBlocks } from '@cms/sdk';
  import type { ArchivePathsState, Block, SlotMap } from '@cms/sdk';
  import type { CommentSection } from '#lib/server/comments.js';
  import type { BlockData } from '#lib/server/theme-queries.js';
  import type {
    MenuItemView,
    PostList,
    ReadingView,
    SiteView,
    ThemeView,
    WidgetView,
  } from '#lib/server/public-view.js';
  import Blocks from '#lib/theme/blocks/Blocks.svelte';
  import SlotOutlet from '#lib/theme/SlotOutlet.svelte';
  import { provideScope } from '#lib/theme/scope.js';
  import {
    isFrontPage,
    pickTemplate,
    templateCandidates,
  } from '#lib/theme/template.js';
  import type { ThemePage } from '#lib/theme/template.js';

  interface Props {
    /** Layout data plus the page's own data (`page.data`). */
    data: {
      archives?: ArchivePathsState;
      queries?: Record<string, PostList>;
      terms?: BlockData['terms'];
      months?: BlockData['months'];
      adjacent?: BlockData['adjacent'];
      theme: ThemeView;
      site: SiteView;
      reading: ReadingView;
      menus: { primary: MenuItemView[] | null; footer: MenuItemView[] | null };
      widgets: { sidebar: WidgetView[]; footer: WidgetView[] };
      pages: { path: string; title: string }[];
      slots?: SlotMap;
      fieldLabels?: { key: string; label: string; type: string }[];
      comments?: CommentSection | null;
      moderation?: boolean;
      toolbar?: unknown;
    };
    page: ThemePage;
    previewBlocks?: Block[];
  }

  let { data, page, previewBlocks }: Props = $props();

  provideScope(() => ({
    archives: data.archives,
    queries: data.queries,
    terms: data.terms ?? { category: null, tag: null },
    months: data.months ?? null,
    adjacent: data.adjacent ?? null,
    theme: data.theme,
    site: data.site,
    reading: data.reading,
    menus: data.menus,
    widgets: data.widgets,
    pages: data.pages,
    page,
    slots: data.slots ?? null,
    fieldLabels: data.fieldLabels ?? [],
    comments: data.comments ?? null,
    moderation: data.moderation ?? false,
    signedIn: !!data.toolbar,
  }));

  const blocks = $derived(
    previewBlocks ??
      pickTemplate(
        data.theme.templates,
        templateCandidates(page, isFrontPage(page)),
      ),
  );

  // Header and footer slots follow the header/footer template parts; templates without them
  // still render every slot (AGENTS.md 6.4).
  const areas = $derived(
    [...walkBlocks(blocks)].map((block) =>
      block.name === 'template-part'
        ? data.theme.parts.find((part) => part.slug === block.attrs.slug)?.area
        : undefined,
    ),
  );
</script>

{#if !areas.includes('header')}
  <SlotOutlet fragments={data.slots?.['site.header'] ?? []} />
{/if}
<Blocks {blocks} />
{#if !areas.includes('footer')}
  <SlotOutlet fragments={data.slots?.['site.footer'] ?? []} />
{/if}
