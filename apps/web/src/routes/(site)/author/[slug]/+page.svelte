<script lang="ts">
  import TemplateView from '#lib/theme/TemplateView.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<TemplateView {data} page={data} />
