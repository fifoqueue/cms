<script lang="ts">
  import { resolve } from '$app/paths';
  import { Search } from '@lucide/svelte';
  import { useI18n } from '#lib/i18n/index.js';
  import { useScope } from '#lib/theme/scope.js';

  let { showLabel }: { showLabel: boolean } = $props();

  const scope = useScope();
  const i18n = useI18n();
  const m = $derived(i18n.m);
  const id = $props.id();
  const query = $derived.by(() => {
    const page = scope().page;
    return page.kind === 'search' ? page.query : '';
  });
</script>

<form
  role="search"
  method="GET"
  action={resolve('/(site)')}
  class="cms-block-search flex flex-col gap-2"
>
  <label for={id} class={showLabel ? 'text-sm font-medium' : 'sr-only'}
    >{m.search}</label
  >
  <div
    class="flex h-10 items-center rounded-full border bg-background pr-1 pl-4 transition focus-within:ring-2 focus-within:ring-ring"
  >
    <input
      {id}
      name="q"
      type="search"
      maxlength={200}
      placeholder={m.searchPlaceholder}
      value={query}
      class="h-full w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground {showLabel
        ? ''
        : '@min-[40rem]:w-36'}"
    />
    <button
      type="submit"
      class="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
      aria-label={m.search}><Search class="size-4" /></button
    >
  </div>
</form>
