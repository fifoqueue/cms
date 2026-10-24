<script lang="ts">
  import { page } from '$app/state';
  import ContentForm from '#lib/admin/ContentForm.svelte';
  import { useI18n } from '#lib/i18n/index.js';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();

  const i18n = useI18n();
  const m = $derived(i18n.m);
  const type = $derived(
    data.model.types.find(
      (option) => option.key === page.url.searchParams.get('type'),
    )?.key ?? 'post',
  );
</script>

<svelte:head><title>{m.contentNewTitle}</title></svelte:head>

<h1 class="text-2xl font-semibold">{m.contentNewTitle}</h1>
<!-- A refused save shows in the editor, by its save button. -->
<!-- A different account gets a fresh form (its backups belong to that account). -->
{#key data.authorId}
  <ContentForm
    {type}
    values={form && 'values' in form ? form.values : undefined}
    parentPages={data.parentPages}
    extraTaxonomies={data.extraTaxonomies}
    categories={data.categories}
    tags={data.tags}
    seo={data.seo}
    model={data.model}
    authors={data.authors}
    canPublish={data.canPublish}
    canManageTerms={data.canManageTerms}
    userId={data.authorId}
    defaults={data.defaults}
    defaultAuthorId={data.authorId}
  />
{/key}
