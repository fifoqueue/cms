<script lang="ts">
  import { resolve } from '$app/paths';
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '$app/forms';
  import { SvelteURLSearchParams } from 'svelte/reactivity';
  import { COMMENT_STATUSES } from '@cms/sdk';
  import type { CommentStatus } from '@cms/sdk';
  import { Search } from '@lucide/svelte';
  import FormMessage from '#lib/admin/FormMessage.svelte';
  import ScreenOptions from '#lib/admin/ScreenOptions.svelte';
  import { COMMENT_COLUMNS } from '#lib/admin/screen-options.js';
  import { Badge } from '#lib/components/ui/badge/index.js';
  import { Button } from '#lib/components/ui/button/index.js';
  import { Input } from '#lib/components/ui/input/index.js';
  import {
    NativeSelect,
    NativeSelectOption,
  } from '#lib/components/ui/native-select/index.js';
  import { Textarea } from '#lib/components/ui/textarea/index.js';
  import { useI18n } from '#lib/i18n/index.js';
  import type { Messages } from '#lib/i18n/index.js';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();

  const i18n = useI18n();
  const m = $derived(i18n.m);

  const statusName = (messages: Messages, status: CommentStatus) =>
    ({
      pending: messages.commentPending,
      approved: messages.commentApproved,
      spam: messages.commentSpam,
      trash: messages.trashView,
    })[status];

  const query = (
    changes: Record<string, string | number | undefined>,
  ): `?${string}` => {
    const params = new SvelteURLSearchParams();
    for (const [key, value] of Object.entries({
      ...data.filter,
      page: data.comments.page,
      ...changes,
    }))
      if (value !== undefined) params.set(key, String(value));
    return `?${params}`;
  };

  const lastPage = $derived(
    Math.max(1, Math.ceil(data.comments.total / data.comments.pageSize)),
  );
  let selected = $state<string[]>([]);
  const view = $derived(data.filter.status);
  const removable = $derived(view === 'spam' || view === 'trash');

  const confirmDelete: SubmitFunction = ({ formData, cancel }) => {
    if (formData.get('action') === 'delete' && !confirm(m.confirmDelete))
      cancel();
    return ({ update }) => {
      selected = [];
      return update();
    };
  };
  const date = (value: string) => new Date(value).toLocaleString(i18n.language);
</script>

<svelte:head><title>{m.navComments}</title></svelte:head>

<h1 class="text-2xl font-semibold">{m.navComments}</h1>

<ScreenOptions
  screen="comments"
  columns={COMMENT_COLUMNS.map((key) => ({
    key,
    label: key === 'email' ? m.commentEmail : m.commentInResponseTo,
  }))}
  hidden={data.screen.hidden}
  perPage={data.screen.perPage}
/>

<nav class="flex flex-wrap gap-2 text-sm" aria-label={m.columnStatus}>
  <a
    href={resolve(
      `/admin/(app)/comments${query({ status: undefined, page: 1 })}`,
    )}
    aria-current={!view}
    class="filter"
    >{m.anyStatus} ({data.counts.pending + data.counts.approved})</a
  >
  {#each COMMENT_STATUSES as status (status)}
    <a
      href={resolve(`/admin/(app)/comments${query({ status, page: 1 })}`)}
      aria-current={view === status}
      class="filter">{statusName(m, status)} ({data.counts[status]})</a
    >
  {/each}
</nav>

<form method="GET" role="search" class="flex gap-2" aria-label={m.filter}>
  {#if view}<input type="hidden" name="status" value={view} />{/if}
  {#if data.filter.contentId}<input
      type="hidden"
      name="contentId"
      value={data.filter.contentId}
    />{/if}
  <Input
    name="q"
    type="search"
    maxlength={200}
    placeholder={m.commentSearch}
    aria-label={m.commentSearch}
    value={data.filter.q ?? ''}
    class="w-64"
  />
  <Button type="submit" variant="outline"
    ><Search class="size-4" /> {m.filter}</Button
  >
</form>

{#if data.filter.contentId}
  <p class="text-sm">
    {m.commentsForEntry(
      data.comments.items[0]?.contentTitle ?? data.filter.contentId,
    )}
    <a
      href={resolve(
        `/admin/(app)/comments${query({ contentId: undefined, page: 1 })}`,
      )}
      class="text-primary hover:underline">{m.commentsAllEntries}</a
    >
  </p>
{/if}

<FormMessage {form} />

<form
  method="POST"
  action="?/bulk"
  use:enhance={confirmDelete}
  class="space-y-3"
>
  <div class="flex flex-wrap items-center gap-2">
    <label class="sr-only" for="bulk-action">{m.bulkActions}</label>
    <NativeSelect id="bulk-action" name="action" size="sm">
      <NativeSelectOption value="approve">{m.commentApprove}</NativeSelectOption
      >
      <NativeSelectOption value="unapprove"
        >{view === 'spam'
          ? m.commentNotSpam
          : view === 'trash'
            ? m.restore
            : m.commentUnapprove}</NativeSelectOption
      >
      {#if view !== 'spam'}<NativeSelectOption value="spam"
          >{m.commentMarkSpam}</NativeSelectOption
        >{/if}
      {#if view !== 'trash'}<NativeSelectOption value="trash"
          >{m.moveToTrash}</NativeSelectOption
        >{/if}
      {#if removable}
        <NativeSelectOption value="delete"
          >{m.deletePermanently}</NativeSelectOption
        >
      {/if}
    </NativeSelect>
    <Button
      type="submit"
      variant="outline"
      size="sm"
      disabled={!selected.length}>{m.apply}</Button
    >
  </div>
  {#each data.comments.items as item (item.id)}
    <input
      type="hidden"
      name="ids"
      value={item.id}
      disabled={!selected.includes(item.id)}
    />
  {/each}
</form>

<ul class="space-y-3">
  {#each data.comments.items as item (item.id)}
    <li
      class="grid gap-3 rounded-md border bg-background p-4 {item.status ===
      'pending'
        ? 'border-l-4 border-l-amber-500'
        : ''}"
    >
      <div class="flex flex-wrap items-start gap-3">
        <input
          type="checkbox"
          aria-label={m.selectItem(item.authorName)}
          value={item.id}
          bind:group={selected}
          class="mt-1"
        />
        <div class="min-w-0 flex-1 space-y-1">
          <p class="text-sm">
            <span class="font-medium">{item.authorName}</span>
            {#if !data.screen.hidden.includes('email')}
              <span class="text-muted-foreground">· {item.authorEmail}</span>
              {#if item.authorUrl}<span class="text-muted-foreground"
                  >· {item.authorUrl}</span
                >{/if}
            {/if}
            <Badge variant="secondary">{statusName(m, item.status)}</Badge>
          </p>
          <p class="text-xs text-muted-foreground">
            {date(item.createdAt)}
            {#if !data.screen.hidden.includes('response')}
              · {m.commentInResponseTo}
              <a
                href={resolve(
                  `/admin/(app)/comments${query({ contentId: item.contentId, page: 1 })}`,
                )}
                class="hover:underline">{item.contentTitle}</a
              >
            {/if}
          </p>
          {#if item.parentId}<p class="text-xs text-muted-foreground">
              {m.commentInReplyTo(item.parentAuthor ?? item.parentId)}
            </p>{/if}
          <p class="text-sm whitespace-pre-line">{item.body}</p>
        </div>
      </div>
      <div class="flex flex-wrap gap-1">
        {#each item.status === 'spam' ? ['unapprove', 'trash', 'delete'] : item.status === 'trash' ? ['unapprove', 'delete'] : [item.status === 'approved' ? 'unapprove' : 'approve', 'spam', 'trash'] as action (action)}
          <form method="POST" action="?/bulk" use:enhance={confirmDelete}>
            <input type="hidden" name="ids" value={item.id} />
            <input type="hidden" name="action" value={action} />
            <Button type="submit" variant="ghost" size="sm"
              >{action === 'approve'
                ? m.commentApprove
                : action === 'unapprove'
                  ? item.status === 'spam'
                    ? m.commentNotSpam
                    : item.status === 'trash'
                      ? m.restore
                      : m.commentUnapprove
                  : action === 'spam'
                    ? m.commentMarkSpam
                    : action === 'trash'
                      ? m.moveToTrash
                      : m.deletePermanently}</Button
            >
          </form>
        {/each}
      </div>
      <details>
        <summary class="cursor-pointer text-sm text-primary"
          >{m.commentReply}</summary
        >
        <form
          method="POST"
          action="?/reply"
          use:enhance
          class="mt-2 grid gap-2"
        >
          <input type="hidden" name="id" value={item.id} />
          <Textarea name="body" rows={3} maxlength={5000} required />
          <div><Button type="submit" size="sm">{m.commentSubmit}</Button></div>
        </form>
      </details>
      <details>
        <summary class="cursor-pointer text-sm text-primary">{m.edit}</summary>
        <form method="POST" action="?/edit" use:enhance class="mt-2 grid gap-2">
          <input type="hidden" name="id" value={item.id} />
          <div class="grid gap-2 sm:grid-cols-3">
            <Input
              name="authorName"
              maxlength={100}
              required
              value={item.authorName}
              aria-label={m.commentName}
            />
            <Input
              name="authorEmail"
              type="email"
              maxlength={191}
              required
              value={item.authorEmail}
              aria-label={m.commentEmail}
            />
            <Input
              name="authorUrl"
              maxlength={255}
              value={item.authorUrl}
              aria-label={m.commentWebsite}
            />
          </div>
          <Textarea
            name="body"
            rows={4}
            maxlength={5000}
            required
            value={item.body}
          />
          <div><Button type="submit" size="sm">{m.save}</Button></div>
        </form>
      </details>
    </li>
  {:else}
    <li class="py-10 text-center text-muted-foreground">{m.commentNone}</li>
  {/each}
</ul>

{#if lastPage > 1}
  <div class="flex justify-between text-sm">
    {#if data.comments.page > 1}<a
        href={resolve(
          `/admin/(app)/comments${query({ page: data.comments.page - 1 })}`,
        )}>{m.previous}</a
      >{:else}<span></span>{/if}
    <span class="text-muted-foreground"
      >{m.pageOf(data.comments.page, lastPage)}</span
    >
    {#if data.comments.page < lastPage}<a
        href={resolve(
          `/admin/(app)/comments${query({ page: data.comments.page + 1 })}`,
        )}>{m.next}</a
      >{:else}<span></span>{/if}
  </div>
{/if}

<style>
  .filter {
    border-radius: var(--radius);
    padding: 0.25rem 0.75rem;
  }
  .filter[aria-current='true'] {
    background: var(--muted);
    font-weight: 500;
  }
</style>
