<script lang="ts">
  import { resolve } from '$app/paths';
  import { formatDate } from '#lib/theme/format.js';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();

  const lastPage = $derived(
    Math.max(1, Math.ceil(data.posts.total / data.posts.pageSize)),
  );
</script>

{#if data.posts.items.length === 0}
  <p class="text-muted-foreground">Nothing published yet.</p>
{:else}
  <ul class="space-y-10">
    {#each data.posts.items as post (post.id)}
      <li>
        <article>
          <time
            class="text-sm text-muted-foreground"
            datetime={post.publishedAt}
          >
            {formatDate(post.publishedAt, data.site.locale)}
          </time>
          <h2 class="mt-1 text-2xl font-semibold tracking-tight">
            <a
              href={resolve('/(site)/[slug]', { slug: post.slug })}
              class="hover:underline">{post.title}</a
            >
          </h2>
          {#if post.excerpt}<p class="mt-2 text-muted-foreground">
              {post.excerpt}
            </p>{/if}
        </article>
      </li>
    {/each}
  </ul>

  {#if lastPage > 1}
    <nav class="mt-12 flex justify-between text-sm">
      {#if data.posts.page > 1}<a
          href={resolve(`/(site)?page=${data.posts.page - 1}`)}>← Newer</a
        >{:else}<span></span>{/if}
      {#if data.posts.page < lastPage}<a
          href={resolve(`/(site)?page=${data.posts.page + 1}`)}>Older →</a
        >{/if}
    </nav>
  {/if}
{/if}
