<script lang="ts">
  import { resolve } from '$app/paths';
  import TermLinks from '#lib/theme/TermLinks.svelte';
  import { useCurrentPost } from '#lib/theme/scope.js';

  let { taxonomy }: { taxonomy: string } = $props();

  const current = useCurrentPost();
  const post = $derived(current().post);
  const terms = $derived(
    taxonomy === 'category'
      ? (post?.categories ?? [])
      : taxonomy === 'tag'
        ? (post?.tags ?? [])
        : (post?.extraTerms.filter((term) => term.taxonomy === taxonomy) ?? []),
  );
</script>

{#if post && terms.length}
  <div class="cms-block-post-terms">
    {#if taxonomy === 'category'}
      <TermLinks categories={post.categories} />
    {:else if taxonomy === 'tag'}
      <TermLinks tags={post.tags} />
    {:else}
      <ul class="flex flex-wrap gap-2 text-sm">
        {#each terms as term (term.id)}
          <li>
            <a
              href={resolve('/(site)/taxonomy/[taxonomy]/[slug]', {
                taxonomy,
                slug: term.slug,
              })}>{term.name}</a
            >
          </li>
        {/each}
      </ul>
    {/if}
  </div>
{/if}
