<script lang="ts">
  import TaxonomyManager from '#lib/admin/TaxonomyManager.svelte';
  import { useI18n } from '#lib/i18n/index.js';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();

  const i18n = useI18n();
</script>

<svelte:head><title>{i18n.m.navCategories}</title></svelte:head>

<TaxonomyManager
  taxonomy="category"
  terms={data.terms}
  editing={data.editing}
  seo={data.seo}
  {form}
/>
