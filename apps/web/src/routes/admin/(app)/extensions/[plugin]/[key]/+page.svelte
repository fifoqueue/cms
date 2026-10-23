<script lang="ts">
  import { enhance } from '$app/forms';
  import AdminBlocks from '#lib/admin/AdminBlocks.svelte';
  import FormMessage from '#lib/admin/FormMessage.svelte';
  import SettingFields from '#lib/admin/SettingFields.svelte';
  import { Button } from '#lib/components/ui/button/index.js';
  import { Alert, AlertTitle } from '#lib/components/ui/alert/index.js';
  import { useI18n } from '#lib/i18n/index.js';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();

  const i18n = useI18n();
  const m = $derived(i18n.m);
</script>

<svelte:head
  ><title>{data.page?.title ?? m.pluginPageFailed}</title></svelte:head
>

<FormMessage {form} />

{#if !data.page}
  <Alert variant="destructive"
    ><AlertTitle>{m.pluginPageFailed}</AlertTitle></Alert
  >
{:else}
  <h1 class="text-2xl font-semibold">{data.page.title}</h1>
  <AdminBlocks blocks={data.page.blocks}>
    {#snippet form(block, index)}
      <form
        method="POST"
        action="?/run"
        use:enhance={() =>
          ({ update }) =>
            update({ reset: false })}
        class="grid gap-4 rounded-md border bg-background p-4"
      >
        <input type="hidden" name="action" value={block.action} />
        <SettingFields
          fields={block.fields}
          values={{}}
          idPrefix="{block.action}-{index}"
        />
        <div><Button type="submit" size="sm">{block.submit}</Button></div>
      </form>
    {/snippet}
  </AdminBlocks>
{/if}
