<script lang="ts">
  import { page } from '$app/state';
  import TemplateView from '#lib/theme/TemplateView.svelte';
  import type { LayoutData } from './$types';

  /** Errors under the site layout render the theme's `404` (or `index`) template. */
  const data = $derived(page.data as LayoutData);
</script>

<TemplateView
  {data}
  page={{
    kind: 'error',
    status: page.status,
    message: page.error?.message ?? '',
  }}
/>
