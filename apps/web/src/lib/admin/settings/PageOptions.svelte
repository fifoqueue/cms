<script lang="ts">
  import { NativeSelectOption } from '#lib/components/ui/native-select/index.js';

  let {
    pages,
    empty,
  }: {
    pages: { id: string; title: string }[];
    empty: string;
  } = $props();
</script>

<NativeSelectOption value="">{empty}</NativeSelectOption>
{#each pages as page (page.id)}
  <NativeSelectOption value={page.id}>{page.title}</NativeSelectOption>
{/each}
