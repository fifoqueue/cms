<script lang="ts">
  import Blocks from '#lib/theme/blocks/Blocks.svelte';
  import SlotOutlet from '#lib/theme/SlotOutlet.svelte';
  import {
    provideBlockPath,
    provideParts,
    useParts,
    useScope,
  } from '#lib/theme/scope.js';

  let { slug }: { slug: string } = $props();

  const scope = useScope();
  const trail = useParts();
  // svelte-ignore state_referenced_locally
  provideParts([...trail, slug]);
  // A part's blocks belong to the part, not to the template being edited.
  provideBlockPath(undefined);

  /** A part that includes itself (directly or through another part) renders nothing. */
  const part = $derived(
    trail.includes(slug)
      ? undefined
      : scope().theme.parts.find((entry) => entry.slug === slug),
  );
  const slots = $derived(scope().slots);
</script>

{#if part}
  <Blocks blocks={part.blocks} />
  {#if part.area === 'header' && trail.length === 0}
    <SlotOutlet fragments={slots?.['site.header'] ?? []} />
  {:else if part.area === 'footer' && trail.length === 0}
    <SlotOutlet fragments={slots?.['site.footer'] ?? []} />
  {/if}
{/if}
