<script lang="ts">
  import type { ComponentProps } from 'svelte';
  import TemplateView from '#lib/theme/TemplateView.svelte';
  import type { ThemePage } from '#lib/theme/template.js';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();

  // The load is re-exported from `[...path]`, so SvelteKit cannot infer its data type here.
  const view = $derived(
    data as unknown as ComponentProps<typeof TemplateView>['data'] & ThemePage,
  );
</script>

<TemplateView data={view} page={view} />
