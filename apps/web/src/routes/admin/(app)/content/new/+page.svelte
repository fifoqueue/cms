<script lang="ts">
  import { page } from '$app/state';
  import ContentForm from '#lib/admin/ContentForm.svelte';
  import FormMessage from '#lib/admin/FormMessage.svelte';
  import type { PageProps } from './$types';

  let { form }: PageProps = $props();

  const type = page.url.searchParams.get('type') === 'page' ? 'page' : 'post';
</script>

<svelte:head><title>New content</title></svelte:head>

<h1 class="text-2xl font-semibold">New content</h1>
<FormMessage {form} />
<ContentForm {type} submitLabel="Create" />
