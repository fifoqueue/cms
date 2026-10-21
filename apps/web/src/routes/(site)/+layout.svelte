<script lang="ts">
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import type { SlotMap } from '@cms/sdk';
  import SlotOutlet from '#lib/theme/SlotOutlet.svelte';
  import type { LayoutProps } from './$types';

  let { data, children }: LayoutProps = $props();

  // Pages that show content load their own slots (with content context); they take precedence.
  const slots = $derived(
    (page.data.slots as SlotMap | undefined) ?? data.slots,
  );
</script>

<svelte:head>
  <title>{data.site.title}</title>
  {#if data.site.description}<meta
      name="description"
      content={data.site.description}
    />{/if}
  <SlotOutlet fragments={slots.head} />
</svelte:head>

<div
  class="flex min-h-screen flex-col bg-background text-foreground"
  lang={data.site.locale}
>
  <header class="border-b">
    <div
      class="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-4 px-4 py-6"
    >
      <a href={resolve('/(site)')} class="text-xl font-semibold tracking-tight"
        >{data.site.title}</a
      >
      {#if data.pages.length}
        <nav class="flex flex-wrap gap-4 text-sm text-muted-foreground">
          {#each data.pages as item (item.slug)}
            <a
              href={resolve('/(site)/[slug]', { slug: item.slug })}
              class="hover:text-foreground">{item.title}</a
            >
          {/each}
        </nav>
      {/if}
    </div>
    <SlotOutlet fragments={slots['site.header']} />
  </header>

  <main class="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
    {@render children()}
  </main>

  <footer class="border-t">
    <div class="mx-auto max-w-3xl px-4 py-6 text-sm text-muted-foreground">
      <SlotOutlet fragments={slots['site.footer']} />
      <p>© {new Date().getFullYear()} {data.site.title}</p>
    </div>
  </footer>
</div>
