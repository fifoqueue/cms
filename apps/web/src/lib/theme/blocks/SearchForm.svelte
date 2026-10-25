<script lang="ts">
  import type { Path } from '$app/types';
  import { afterNavigate } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { archivePath } from '@cms/sdk';
  import { default as Search } from '@lucide/svelte/icons/search';
  import { default as X } from '@lucide/svelte/icons/x';
  import { useI18n } from '#lib/i18n/index.js';
  import { modal } from '#lib/theme/modal.js';
  import { useScope } from '#lib/theme/scope.js';

  /**
   * A search form, or with `panel` a search button that opens a search panel: a heading,
   * the form and the categories, below the header that holds the button.
   */
  let { showLabel, panel = false }: { showLabel: boolean; panel?: boolean } =
    $props();

  const scope = useScope();
  const i18n = useI18n();
  const m = $derived(i18n.m);
  const id = $props.id();
  const query = $derived.by(() => {
    const page = scope().page;
    return page.kind === 'search' ? page.query : '';
  });
  const bases = $derived(
    scope().archives?.bases ?? { category: '/category', tag: '/tag' },
  );

  let open = $state(false);
  /** The panel's top edge: the bottom of the header (or block) that holds the button. */
  let top = $state(0);
  let button = $state<HTMLButtonElement>();

  const place = () => {
    const anchor = button?.closest('header') ?? button;
    top = Math.max(0, anchor?.getBoundingClientRect().bottom ?? 0);
  };
  const show = () => {
    place();
    open = true;
  };
  // `modal` returns focus to the button when the panel goes away.
  const hide = () => {
    open = false;
  };
  afterNavigate(() => {
    open = false;
  });
</script>

<svelte:window
  onresize={() => open && place()}
  onscroll={() => open && place()}
/>

{#snippet form(inPanel: boolean)}
  <form
    role="search"
    method="GET"
    action={resolve('/(site)')}
    class="cms-block-search flex flex-col gap-2"
  >
    <label
      for="{id}-{inPanel ? 'panel' : 'inline'}"
      class={showLabel && !inPanel ? 'text-sm font-medium' : 'sr-only'}
      >{m.search}</label
    >
    <div
      class="flex h-10 items-center rounded-full border bg-background pr-1 pl-4 transition focus-within:ring-2 focus-within:ring-ring"
    >
      {#if inPanel}
        <input
          data-autofocus
          id="{id}-panel"
          name="q"
          type="search"
          required
          maxlength={200}
          placeholder={m.searchPlaceholder}
          value={query}
          class="h-full w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      {:else}
        <input
          id="{id}-inline"
          name="q"
          type="search"
          maxlength={200}
          placeholder={m.searchPlaceholder}
          value={query}
          class="h-full w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground {showLabel
            ? ''
            : '@min-[40rem]:w-36'}"
        />
      {/if}
      <button
        type="submit"
        class="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
        ><Search class="size-4" aria-hidden="true" /><span
          class="cms-search-submit-label sr-only">{m.search}</span
        ></button
      >
    </div>
  </form>
{/snippet}

{#if panel}
  <button
    bind:this={button}
    type="button"
    class="cms-search-toggle inline-flex size-10 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-muted"
    aria-label={open ? m.themeSearchClose : m.search}
    aria-expanded={open}
    aria-controls="{id}-dialog"
    onclick={() => (open ? hide() : show())}
  >
    {#if open}
      <X class="size-5" aria-hidden="true" />
    {:else}
      <Search class="size-5" aria-hidden="true" />
    {/if}
  </button>
  {#if open}
    <!-- The toggle stays usable (it closes the panel); the rest of the page is inert. -->
    <div use:modal={{ close: hide, keep: [button] }}>
      <button
        type="button"
        class="cms-search-backdrop fixed inset-x-0 bottom-0 z-40 cursor-default bg-black/30"
        style:top="{top}px"
        tabindex="-1"
        aria-label={m.themeSearchClose}
        onclick={hide}
      ></button>
      <div
        id="{id}-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="{id}-title"
        class="cms-search-panel fixed inset-x-0 z-40 overflow-y-auto bg-background text-foreground shadow-lg"
        style:top="{top}px"
        style:max-height="calc(100dvh - {top}px)"
      >
        <div
          class="mx-auto flex w-full max-w-[50rem] flex-col gap-6 px-6 pt-6 @min-[62rem]:gap-8 @min-[62rem]:px-0 @min-[62rem]:pt-10"
        >
          <div
            class="flex items-center justify-between gap-4 @min-[62rem]:justify-center"
          >
            <h2 id="{id}-title" class="cms-heading text-2xl font-bold">
              {m.themeSearchPanel}
            </h2>
            <button
              type="button"
              class="flex size-10 shrink-0 items-center justify-center rounded-full hover:bg-muted @min-[62rem]:hidden"
              aria-label={m.themeSearchClose}
              onclick={hide}><X class="size-6" aria-hidden="true" /></button
            >
          </div>
          {@render form(true)}
          {#if scope().terms.category?.length}
            <ul class="cms-search-panel-terms flex flex-wrap gap-2">
              {#each scope().terms.category ?? [] as term (term.slug)}
                <li>
                  <a
                    href={resolve(
                      archivePath(bases, 'category', term.slug) as Path,
                    )}
                    class="inline-flex rounded bg-muted px-3 py-1.5 text-sm"
                    >{term.name}</a
                  >
                </li>
              {/each}
            </ul>
          {/if}
        </div>
      </div>
    </div>
  {/if}
{:else}
  {@render form(false)}
{/if}
