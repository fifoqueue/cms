<script lang="ts">
  import { afterNavigate } from '$app/navigation';
  import { default as ChevronRight } from '@lucide/svelte/icons/chevron-right';
  import { default as Search } from '@lucide/svelte/icons/search';
  import { Command, Dialog } from 'bits-ui';
  import { onMount } from 'svelte';
  import { ADMIN_LOCALES } from '@cms/sdk/locales';
  import { adminSections, visibleSections } from '#lib/admin/admin-nav.js';
  import type {
    NavContext,
    NavUser,
    PluginPage,
  } from '#lib/admin/admin-nav.js';
  import { searchNav } from '#lib/admin/nav-search.js';
  import { messagesFor, useI18n } from '#lib/i18n/index.js';

  /** The screen search: every menu entry and tab the user may open, by name in any language. */
  let {
    user,
    pluginPages,
    types = [],
    taxonomies = [],
  }: Omit<NavContext, 'counts'> & {
    user: NavUser;
    pluginPages: readonly PluginPage[];
  } = $props();

  const i18n = useI18n();
  const m = $derived(i18n.m);
  const catalogs = ADMIN_LOCALES.map(messagesFor);

  let open = $state(false);
  let query = $state('');

  const entries = $derived(
    visibleSections(
      adminSections({ types, taxonomies }),
      user,
      pluginPages,
    ).flatMap((section) =>
      section.items.map((item) => ({
        href: item.href,
        group: section.label(m),
        label: item.label(m),
        groups: catalogs.map((catalog) => section.label(catalog)),
        labels: catalogs.map((catalog) => item.label(catalog)),
        keywords: item.keywords,
      })),
    ),
  );
  const results = $derived(searchNav(entries, query));

  // The shortcut reads ⌘K on Apple keyboards.
  let apple = $state(false);
  onMount(() => {
    apple = /Mac|iPhone|iPad/.test(navigator.platform);
  });

  /** Closing clears the query, so the next search starts empty. */
  const close = () => {
    open = false;
    query = '';
  };

  afterNavigate(close);

  /** Whether the key went to a text field or editor, whose native Ctrl+K (e.g. macOS
   *  delete-to-end-of-line) must keep working. */
  const editable = (target: EventTarget | null) =>
    target instanceof HTMLElement &&
    (target.isContentEditable || target.matches('input, textarea, select'));

  /** Ctrl+K / ⌘K, unless the focused control already used it or is editable. While the
   *  palette is open the shortcut always closes it, its own search field included. */
  const toggleOnShortcut = (event: KeyboardEvent) => {
    if (
      event.defaultPrevented ||
      (!open && editable(event.target)) ||
      !(event.ctrlKey || event.metaKey) ||
      event.altKey ||
      event.shiftKey ||
      // `code` too: a Korean layout reports the K key as `ㅏ`.
      (event.key.toLowerCase() !== 'k' && event.code !== 'KeyK')
    )
      return;
    event.preventDefault();
    if (open) close();
    else open = true;
  };
</script>

<svelte:window onkeydown={toggleOnShortcut} />

<button
  type="button"
  class="inline-flex items-center gap-1.5 rounded px-2 py-1 text-muted-foreground hover:bg-muted hover:text-foreground"
  aria-haspopup="dialog"
  aria-keyshortcuts={apple ? 'Meta+K' : 'Control+K'}
  onclick={() => (open = true)}
>
  <Search class="size-4" aria-hidden="true" />
  <span class="max-sm:sr-only">{m.adminSearchOpen}</span>
  <kbd
    class="hidden rounded border bg-muted px-1.5 font-sans text-[0.6875rem] leading-5 sm:inline"
    aria-hidden="true">{apple ? '⌘K' : 'Ctrl K'}</kbd
  >
</button>

<Dialog.Root
  bind:open
  onOpenChange={(value) => {
    if (!value) close();
  }}
>
  <Dialog.Portal>
    <Dialog.Overlay
      class="fixed inset-0 z-50 bg-black/50 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0"
    />
    <Dialog.Content
      class="fixed top-[max(1rem,10vh)] left-1/2 z-50 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-xl duration-150 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
    >
      <Dialog.Title class="sr-only">{m.adminSearchTitle}</Dialog.Title>
      <Dialog.Description class="sr-only"
        >{m.adminSearchHint}</Dialog.Description
      >
      <Command.Root shouldFilter={false} loop label={m.adminSearchTitle}>
        <div class="flex items-center gap-2 border-b px-3">
          <Search
            class="size-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <Command.Input
            bind:value={query}
            placeholder={m.adminSearchPlaceholder}
            class="h-12 w-full min-w-0 bg-transparent text-base outline-none placeholder:text-muted-foreground md:text-sm"
          />
        </div>
        <Command.List
          aria-label={m.adminSearchTitle}
          class="max-h-[min(24rem,calc(100dvh-10rem))] overflow-y-auto overscroll-contain p-1"
        >
          <Command.Viewport>
            {#if results.length === 0}
              <Command.Empty
                forceMount
                class="px-3 py-6 text-center text-sm text-muted-foreground"
                >{m.adminSearchEmpty}</Command.Empty
              >
            {/if}
            <!-- Every href comes from resolve() in `admin-nav.ts`. -->
            <!-- eslint-disable svelte/no-navigation-without-resolve -->
            {#each results as result (result.href)}
              <Command.LinkItem
                href={result.href}
                value={result.href}
                onSelect={close}
                class="flex min-h-10 items-center gap-1 rounded-md px-3 py-2 text-sm outline-none data-selected:bg-accent data-selected:text-accent-foreground"
              >
                {#if result.group !== result.label}
                  <span class="truncate text-muted-foreground"
                    >{result.group}</span
                  >
                  <ChevronRight
                    class="size-3.5 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <span class="sr-only">›</span>
                {/if}
                <span class="truncate">{result.label}</span>
              </Command.LinkItem>
            {/each}
            <!-- eslint-enable svelte/no-navigation-without-resolve -->
          </Command.Viewport>
        </Command.List>
      </Command.Root>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
