<script lang="ts">
  import { page } from '$app/state';
  import TaxonomyManager from '#lib/admin/TaxonomyManager.svelte';
  import { useI18n } from '#lib/i18n/index.js';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();

  const i18n = useI18n();
</script>

<svelte:head
  ><title>{data.definition?.name ?? i18n.m.customTaxonomies}</title
  ></svelte:head
>
<h1 class="text-2xl font-semibold">{data.definition?.name}</h1>

<TaxonomyManager
  taxonomy={page.params.taxonomy!}
  hierarchical={data.definition?.hierarchical ?? false}
  terms={data.terms}
  editing={data.editing}
  seo={data.seo}
  {form}
/>
