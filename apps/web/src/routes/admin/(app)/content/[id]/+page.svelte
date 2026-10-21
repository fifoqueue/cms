<script lang="ts">
  import { resolve } from '$app/paths';
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '$app/forms';
  import { ExternalLink, Trash2 } from '@lucide/svelte';
  import ContentForm from '#lib/admin/ContentForm.svelte';
  import FormMessage from '#lib/admin/FormMessage.svelte';
  import { Button } from '#lib/components/ui/button/index.js';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();

  const confirmDelete: SubmitFunction = ({ cancel }) => {
    if (!confirm('Delete this item permanently?')) cancel();
  };
</script>

<svelte:head><title>Edit · {data.entry.title}</title></svelte:head>

<div class="flex flex-wrap items-center justify-between gap-4">
  <h1 class="text-2xl font-semibold">Edit {data.entry.type}</h1>
  <div class="flex gap-2">
    {#if data.entry.status === 'published'}
      <Button
        href={resolve('/(site)/[slug]', { slug: data.entry.slug })}
        variant="outline"
        target="_blank"><ExternalLink class="size-4" /> View</Button
      >
    {/if}
    <form method="POST" action="?/delete" use:enhance={confirmDelete}>
      <Button type="submit" variant="destructive"
        ><Trash2 class="size-4" /> Delete</Button
      >
    </form>
  </div>
</div>

<FormMessage {form} />
{#key data.entry.id}
  <ContentForm entry={data.entry} submitLabel="Save" />
{/key}
