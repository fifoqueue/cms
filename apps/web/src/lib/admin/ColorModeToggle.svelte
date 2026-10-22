<script lang="ts">
  import { invalidate } from '$app/navigation';
  import { Monitor, Moon, Sun } from '@lucide/svelte';
  import {
    COLOR_MODE_DEPENDENCY,
    saveColorMode,
  } from '#lib/admin/color-mode.js';
  import type { ColorMode } from '#lib/admin/color-mode.js';
  import { useI18n } from '#lib/i18n/index.js';

  let { mode }: { mode: ColorMode } = $props();

  const i18n = useI18n();

  const options = [
    { mode: 'light', icon: Sun, label: 'colorModeLight' },
    { mode: 'dark', icon: Moon, label: 'colorModeDark' },
    { mode: 'system', icon: Monitor, label: 'colorModeSystem' },
  ] as const;

  const choose = (next: ColorMode) => {
    saveColorMode(next);
    // The admin layout re-reads the cookie and applies it.
    void invalidate(COLOR_MODE_DEPENDENCY);
  };
</script>

<div
  role="group"
  aria-label={i18n.m.colorMode}
  class="inline-flex rounded-md border p-0.5"
>
  {#each options as option (option.mode)}
    {@const Icon = option.icon}
    {@const label = i18n.m[option.label]}
    <button
      type="button"
      title={label}
      aria-pressed={mode === option.mode}
      onclick={() => choose(option.mode)}
      class="rounded-sm p-1.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none aria-pressed:bg-muted aria-pressed:text-foreground"
    >
      <Icon class="size-4" />
      <span class="sr-only">{label}</span>
    </button>
  {/each}
</div>
