<script lang="ts">
  import { page } from '$app/state';
  import ContentForm from '#lib/admin/ContentForm.svelte';
  import FormMessage from '#lib/admin/FormMessage.svelte';
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
<FormMessage {form} />
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
  defaultAuthorId={data.authorId}
  submitLabel={m.create}
/>
