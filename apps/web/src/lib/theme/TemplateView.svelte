<script lang="ts">
  import { walkBlocks } from '@cms/sdk';
  import type { Block } from '@cms/sdk';
  import Blocks from '#lib/theme/blocks/Blocks.svelte';
  import SlotOutlet from '#lib/theme/SlotOutlet.svelte';
  import { provideBlockPath, provideScope } from '#lib/theme/scope.js';
  import type { ScopeData } from '#lib/theme/scope.js';
  import {
    isFrontPage,
    pickTemplate,
    templateCandidates,
  } from '#lib/theme/template.js';
  import type { ThemePage } from '#lib/theme/template.js';

  interface Props {
    /** Layout data plus the page's own data (`page.data`). */
    data: ScopeData;
    page: ThemePage;
    previewBlocks?: Block[];
    /** In the site editor: blocks are marked so the canvas can select them. */
    editable?: boolean;
  }

  let { data, page, previewBlocks, editable = false }: Props = $props();

  // svelte-ignore state_referenced_locally
  if (editable) provideBlockPath([]);

  provideScope(() => ({
    linkRoutes: data.linkRoutes ?? {},
    privacy: data.privacy,
    archives: data.archives,
    queries: data.queries,
    terms: data.terms ?? { category: null, tag: null },
    months: data.months ?? null,
    adjacent: data.adjacent ?? null,
    pageTree: data.pageTree ?? null,
    recentComments: data.recentComments ?? null,
    authors: data.authors ?? null,
    calendar: data.calendar ?? null,
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
