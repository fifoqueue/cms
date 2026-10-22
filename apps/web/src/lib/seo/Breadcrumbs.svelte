<script lang="ts">
  import type { Path } from '$app/types';
  import { resolve } from '$app/paths';
  import type { Crumb } from '#lib/seo/head.js';

  /** Visible trail matching the page's BreadcrumbList; the last step is the current page. */
  let { items }: { items: Crumb[] } = $props();
</script>

{#if items.length > 1}
  <nav aria-label="Breadcrumb" class="mb-6 text-sm text-muted-foreground">
    <ol class="flex flex-wrap items-center gap-x-2 gap-y-1">
      {#each items as item, index (index)}
        <li class="flex items-center gap-2">
          {#if index > 0}<span aria-hidden="true">/</span>{/if}
          {#if index === items.length - 1}
            <span aria-current="page" class="text-foreground">{item.name}</span>
          {:else}
            <a
              class="hover:text-foreground"
              href={item.target.kind === 'home'
                ? resolve('/(site)')
                : item.target.kind === 'content'
                  ? resolve(item.target.path as Path)
                  : item.target.kind === 'taxonomy'
                    ? resolve('/(site)/taxonomy/[taxonomy]/[slug]', {
                        taxonomy: item.target.taxonomy,
                        slug: item.target.slug,
                      })
                    : item.target.kind === 'category'
                      ? resolve('/(site)/category/[slug]', {
                          slug: item.target.slug,
                        })
                      : resolve('/(site)/tag/[slug]', {
                          slug: item.target.slug,
                        })}>{item.name}</a
            >
          {/if}
        </li>
      {/each}
    </ol>
  </nav>
{/if}
