<script lang="ts">
  import ResponsiveImage from '#lib/theme/ResponsiveImage.svelte';
  import { useCurrentPost, useScope } from '#lib/theme/scope.js';

  const current = useCurrentPost();
  const scope = useScope();
  const entry = $derived(current().entry);
  /** Public custom fields with a value, in their defined order. */
  const fields = $derived(
    entry && !entry.protected
      ? scope().fieldLabels.filter(({ key }) => entry.fields[key] !== undefined)
      : [],
  );
</script>

{#if entry && fields.length}
  <dl
    class="cms-block-post-fields grid gap-x-6 gap-y-2 rounded-[var(--radius)] border bg-card p-4 text-sm sm:grid-cols-[auto_1fr]"
  >
    {#each fields as field (field.key)}
      {@const value = entry.fields[field.key]}
      <dt class="font-medium">{field.label}</dt>
      <dd class="text-muted-foreground">
        {#if field.type === 'image' && typeof value === 'object' && value !== null}
          <ResponsiveImage
            image={value as Parameters<typeof ResponsiveImage>[1]['image']}
            sizes="20rem"
            class="h-auto max-w-xs rounded-md"
          />
        {:else if field.type === 'url' && typeof value === 'string'}
          <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- an external address from a field -->
          <a href={value} rel="nofollow noopener" class="underline">{value}</a>
        {:else if field.type === 'boolean'}
          {value ? '✓' : '—'}
        {:else}
          {String(value)}
        {/if}
      </dd>
    {/each}
  </dl>
{/if}
