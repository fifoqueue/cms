<script lang="ts">
  import type { Snippet } from 'svelte';

  /**
   * The one look of every error screen: the status, a title and a hint, then any actions. Colors
   * and fonts come from the surrounding tokens, so a site theme's error page wears the theme.
   */
  let {
    status,
    title,
    help = '',
    level = 1,
    children,
  }: {
    status: number;
    title: string;
    help?: string;
    level?: number;
    children?: Snippet;
  } = $props();
</script>

<div class="cms-error flex flex-col items-center text-center">
  <p
    class="cms-error-status cms-heading text-[clamp(4.5rem,18vw,8rem)] leading-none font-extrabold tracking-tighter text-primary"
  >
    {status}
  </p>
  <svelte:element
    this={`h${level}`}
    class="cms-error-title cms-heading mt-5 text-2xl font-semibold tracking-tight break-keep text-balance @min-[40rem]:text-3xl"
    >{title}</svelte:element
  >
  {#if help}
    <p
      class="cms-error-help mt-3 max-w-md text-base break-keep text-pretty text-muted-foreground"
    >
      {help}
    </p>
  {/if}
  {#if children}
    <div class="cms-error-actions mt-8 flex flex-wrap justify-center gap-3">
      {@render children()}
    </div>
  {/if}
</div>
