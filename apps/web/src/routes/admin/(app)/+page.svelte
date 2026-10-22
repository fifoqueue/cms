<script lang="ts">
  import { resolve } from '$app/paths';
  import { enhance } from '$app/forms';
  import FormMessage from '#lib/admin/FormMessage.svelte';
  import { Button } from '#lib/components/ui/button/index.js';
  import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
  } from '#lib/components/ui/card/index.js';
  import { Input } from '#lib/components/ui/input/index.js';
  import { Textarea } from '#lib/components/ui/textarea/index.js';
  import { useI18n } from '#lib/i18n/index.js';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();

  const i18n = useI18n();
  const m = $derived(i18n.m);
  const date = (value: string) =>
    new Date(value).toLocaleDateString(i18n.language);
</script>

<svelte:head><title>{m.dashboard}</title></svelte:head>

<h1 class="text-2xl font-semibold">{m.dashboard}</h1>

<FormMessage {form} />

<div class="grid gap-6 lg:grid-cols-2">
  <Card>
    <CardHeader><CardTitle>{m.atAGlance}</CardTitle></CardHeader>
    <CardContent>
      <ul class="grid grid-cols-2 gap-2 text-sm">
        {#each data.published as type (type.key)}
          <li>
            <a
              href={resolve(
                `/admin/(app)/content?type=${encodeURIComponent(type.key)}&status=published`,
              )}
              class="hover:underline">{type.count ?? '—'} {type.name}</a
            >
          </li>
        {/each}
        {#if data.drafts}
          <li>
            <a
              href={resolve('/admin/(app)/content?status=draft')}
              class="hover:underline">{m.dashboardDrafts(data.drafts)}</a
            >
          </li>
        {/if}
        {#if data.pending}
          <li>
            <a
              href={resolve('/admin/(app)/content?status=pending')}
              class="hover:underline">{m.dashboardPending(data.pending)}</a
            >
          </li>
        {/if}
        {#if data.scheduled}
          <li>
            <a
              href={resolve('/admin/(app)/content?status=scheduled')}
              class="hover:underline">{m.dashboardScheduled(data.scheduled)}</a
            >
          </li>
        {/if}
        {#if data.comments}
          <li>
            <a
              href={resolve('/admin/(app)/comments?status=pending')}
              class="hover:underline"
              >{m.dashboardComments(data.comments.pending)}</a
            >
          </li>
        {/if}
      </ul>
    </CardContent>
  </Card>

  <Card>
    <CardHeader><CardTitle>{m.quickDraft}</CardTitle></CardHeader>
    <CardContent>
      <form method="POST" action="?/draft" use:enhance class="grid gap-3">
        <Input
          name="title"
          required
          maxlength={255}
          placeholder={m.columnTitle}
          aria-label={m.columnTitle}
        />
        <Textarea
          name="body"
          rows={4}
          placeholder={m.quickDraftBody}
          aria-label={m.quickDraftBody}
        />
        <div><Button type="submit" size="sm">{m.saveDraft}</Button></div>
      </form>
      {#if data.myDrafts.length}
        <h3 class="mt-6 mb-2 text-sm font-medium">{m.yourDrafts}</h3>
        <ul class="space-y-1 text-sm">
          {#each data.myDrafts as draft (draft.id)}
            <li class="flex justify-between gap-2">
              <a
                href={resolve('/admin/(app)/content/[id]', { id: draft.id })}
                class="hover:underline">{draft.title}</a
              >
              <span class="text-muted-foreground">{date(draft.updatedAt)}</span>
            </li>
          {/each}
        </ul>
      {/if}
    </CardContent>
  </Card>

  {#if data.comments?.recent.length}
    <Card class="lg:col-span-2">
      <CardHeader
        ><CardTitle>{m.dashboardWaitingComments}</CardTitle></CardHeader
      >
      <CardContent>
        <ul class="space-y-3 text-sm">
          {#each data.comments.recent as comment (comment.id)}
            <li>
              <span class="font-medium">{comment.authorName}</span>
              <span class="text-muted-foreground">· {comment.contentTitle}</span
              >
              <p class="line-clamp-2">{comment.body}</p>
            </li>
          {/each}
        </ul>
        <a
          href={resolve('/admin/(app)/comments?status=pending')}
          class="mt-3 inline-block text-sm text-primary hover:underline"
          >{m.navComments} →</a
        >
      </CardContent>
    </Card>
  {/if}
</div>
