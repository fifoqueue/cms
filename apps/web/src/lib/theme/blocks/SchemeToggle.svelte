<script lang="ts">
  import { onMount } from 'svelte';
  import { default as Moon } from '@lucide/svelte/icons/moon';
  import { default as Sun } from '@lucide/svelte/icons/sun';
  import { useI18n } from '#lib/i18n/index.js';
  import { useScope } from '#lib/theme/scope.js';
  import {
    alternateScheme,
    SCHEME_ATTRIBUTE,
    SCHEME_KEY,
    siteScheme,
  } from '#lib/theme/style.js';

  /**
   * The light/dark toggle: switches between the theme's palette and its alternate palette
   * (`schemeCss`) and remembers the choice for `schemeScript`. Renders nothing unless the theme
   * offers the toggle. Every toggle on the page follows a change made by another one.
   */
  let { label = false }: { label?: boolean } = $props();

  const CHANGED = 'cms:scheme';
  const scope = useScope();
  const i18n = useI18n();
  const m = $derived(i18n.m);
  const theme = $derived(scope().theme);
  const alternate = $derived(alternateScheme(theme));
  const palette = $derived(siteScheme(theme) ?? 'light');
  /** The scheme on screen; the palette's until mounted, since only the browser knows the choice. */
  let current = $state<'light' | 'dark' | null>(null);
  const shown = $derived(current ?? palette);

  const read = () => {
    const chosen = document.documentElement.getAttribute(SCHEME_ATTRIBUTE);
    if (chosen === 'alternate' && alternate) return alternate;
    if (chosen === 'default') return palette;
    return theme.settings.colorScheme.auto &&
      alternate &&
      matchMedia(`(prefers-color-scheme: ${alternate})`).matches
      ? alternate
      : palette;
  };

  onMount(() => {
    const update = () => (current = read());
    const system = matchMedia('(prefers-color-scheme: dark)');
    update();
    system.addEventListener('change', update);
    window.addEventListener(CHANGED, update);
    return () => {
      system.removeEventListener('change', update);
      window.removeEventListener(CHANGED, update);
    };
  });

  const toggle = () => {
    const next = shown === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute(
      SCHEME_ATTRIBUTE,
      next === alternate ? 'alternate' : 'default',
    );
    try {
      localStorage.setItem(SCHEME_KEY, next);
    } catch {
      // Storage may be unavailable (private mode); the choice still lasts for this page.
    }
    window.dispatchEvent(new Event(CHANGED));
  };

  const action = $derived(
    shown === 'dark' ? m.themeSchemeLight : m.themeSchemeDark,
  );
</script>

{#if theme.settings.colorScheme.toggle && alternate}
  <button
    type="button"
    class="cms-block-scheme-toggle inline-flex shrink-0 items-center justify-center gap-2 rounded-full transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none {label
      ? 'h-10 px-2'
      : 'size-10'}"
    aria-label={label ? undefined : action}
    title={action}
    onclick={toggle}
  >
    {#if shown === 'dark'}
      <Sun class="size-5" aria-hidden="true" />
    {:else}
      <Moon class="size-5" aria-hidden="true" />
    {/if}
    {#if label}<span class="text-sm font-medium">{action}</span>{/if}
  </button>
{/if}
