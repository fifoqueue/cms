<script lang="ts">
  import type { Path } from '$app/types';
  import { resolve } from '$app/paths';
  import type { Block } from '@cms/sdk';
  import { useI18n } from '#lib/i18n/index.js';
  import { useScope } from '#lib/theme/scope.js';

  /** WordPress post navigation: the older and newer entry of the same type. */
  let { block }: { block: Extract<Block, { name: 'post-navigation' }> } =
    $props();

  const scope = useScope();
  const i18n = useI18n();
  const m = $derived(i18n.m);
  const adjacent = $derived(scope().adjacent);
  const links = $derived([
    { rel: 'prev', entry: adjacent?.previous ?? null },
    { rel: 'next', entry: adjacent?.next ?? null },
  ]);
</script>

{#if adjacent?.previous || adjacent?.next}
  <nav
    aria-label={m.themePostNavigation}
    class="cms-block-post-navigation grid gap-4 border-t pt-6 text-sm sm:grid-cols-2"
  >
    {#each links as { rel, entry } (rel)}
      <div class={rel === 'next' ? 'sm:col-start-2 sm:text-right' : ''}>
        {#if entry}
          <a
            href={resolve(entry.path as Path)}
            {rel}
            class="group inline-flex flex-col gap-1"
          >
            <span class="text-muted-foreground"
              >{rel === 'prev' ? m.themePreviousPost : m.themeNextPost}</span
            >
            {#if block.attrs.showTitle}
              <span class="font-medium group-hover:underline"
                >{entry.title}</span
              >
            {/if}
          </a>
        {/if}
      </div>
    {/each}
  </nav>
{/if}
