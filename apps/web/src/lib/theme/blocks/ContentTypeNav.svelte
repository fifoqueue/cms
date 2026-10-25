<script lang="ts">
  import { resolve } from '$app/paths';
  import { useI18n } from '#lib/i18n/index.js';
  import { HOME_LIST_TYPES } from '#lib/theme/pagination.js';
  import { useScope } from '#lib/theme/scope.js';

  /**
   * Posts / articles switch on the home page: a tab for each type with published entries, and
   * no switch at all while only one type has any. Unknown counts show both tabs.
   */
  const scope = useScope();
  const i18n = useI18n();
  const m = $derived(i18n.m);
  const page = $derived(scope().page);
  const types = $derived(scope().listedTypes ?? HOME_LIST_TYPES);
  const tab =
    'rounded-full px-3 py-1 text-sm text-muted-foreground transition hover:bg-muted hover:text-foreground aria-[current=page]:bg-foreground aria-[current=page]:text-background';
</script>

{#if page.kind === 'home' && !page.path && types.length > 1}
  <nav
    aria-label={m.themeContentTypes}
    class="cms-block-content-type-nav flex gap-2"
  >
    {#if types.includes('post')}
      <a
        href={resolve('/(site)')}
        aria-current={page.type === 'post' ? 'page' : undefined}
        class={tab}>{m.themePosts}</a
      >
    {/if}
    {#if types.includes('article')}
      <!-- eslint-disable svelte/no-navigation-without-resolve -- resolve() plus a query string -->
      <a
        href={`${resolve('/(site)')}?type=article`}
        aria-current={page.type === 'article' ? 'page' : undefined}
        class={tab}>{m.themeArticles}</a
      >
      <!-- eslint-enable svelte/no-navigation-without-resolve -->
    {/if}
  </nav>
{/if}
