<script lang="ts">
  import { resolve } from '$app/paths';
  import { enhance } from '$app/forms';
  import AdminBlocks from '#lib/admin/AdminBlocks.svelte';
  import DashboardOptions from '#lib/admin/DashboardOptions.svelte';
  import FormMessage from '#lib/admin/FormMessage.svelte';
  import { CircleAlert, CircleCheck } from '@lucide/svelte';
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
  const dateTime = (value: string | null) =>
    value
      ? new Date(value).toLocaleString(i18n.language, {
          dateStyle: 'medium',
          timeStyle: 'short',
        })
      : '';

  const pluginWidgets = $derived(
    new Map(
      data.widgets.map((widget) => [
        `plugin:${widget.plugin}:${widget.key}`,
        widget,
      ]),
    ),
  );
  /** Boxes this user can have: core ones with content, then plugin widgets. */
  const available = $derived(
    [
      'glance',
      ...(data.health ? ['health'] : []),
      'activity',
      'draft',
      ...(data.comments?.recent.length ? ['comments'] : []),
      ...pluginWidgets.keys(),
    ].sort((a, b) => rank(a) - rank(b)),
  );
  /** The saved order first; boxes the user never placed keep their default position after. */
  const rank = (id: string) => {
    const index = data.layout.order.indexOf(id);
    return index === -1 ? 1000 : index;
  };
  const visible = $derived(
    available.filter((id) => !data.layout.hidden.includes(id)),
  );
  const titleOf = (id: string) =>
    ({
      glance: m.atAGlance,
      health: m.dashboardHealth,
      activity: m.dashboardActivity,
      draft: m.quickDraft,
      comments: m.dashboardWaitingComments,
    })[id] ??
    pluginWidgets.get(id)?.title ??
    id;
</script>

<svelte:head><title>{m.dashboard}</title></svelte:head>

{#snippet entries(
  title: string,
  list: { id: string; title: string; publishedAt: string | null }[],
)}
  {#if list.length}
    <section>
      <h3 class="mb-2 font-medium">{title}</h3>
      <ul class="space-y-1">
        {#each list as entry (entry.id)}
          <li class="grid grid-cols-[8.5rem_1fr] gap-2">
            <span class="text-muted-foreground"
              >{dateTime(entry.publishedAt)}</span
            >
            <a
              href={resolve('/admin/(app)/content/[id]', {
                id: entry.id,
              })}
              class="truncate hover:underline">{entry.title}</a
            >
          </li>
        {/each}
      </ul>
    </section>
  {/if}
{/snippet}

<h1 class="text-2xl font-semibold">{m.dashboard}</h1>

<FormMessage form={form?.dashboardPreferences ? null : form} />

{#snippet glance()}
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
          <li>
            <a
              href={resolve('/admin/(app)/comments?status=approved')}
              class="hover:underline"
              >{m.dashboardApproved(data.comments.approved)}</a
            >
          </li>
        {/if}
      </ul>
    </CardContent>
  </Card>
{/snippet}

{#snippet health()}
  {#if data.health}
    {@const { critical, recommended } = data.health}
    <Card>
      <CardHeader><CardTitle>{m.dashboardHealth}</CardTitle></CardHeader>
      <CardContent class="space-y-2 text-sm">
        <p class="flex items-center gap-2 font-medium">
          {#if critical}
            <CircleAlert class="size-4 text-destructive" />
            {m.dashboardHealthCritical}
          {:else if recommended}
            <CircleAlert class="size-4 text-amber-600" />
            {m.dashboardHealthRecommended}
          {:else}
            <CircleCheck class="size-4 text-emerald-600" />
            {m.dashboardHealthGood}
          {/if}
        </p>
        {#if critical || recommended}
          <p class="text-muted-foreground">
            {m.dashboardHealthCounts(critical, recommended)}
          </p>
        {/if}
        <a
          href={resolve('/admin/(app)/tools/health')}
          class="inline-block text-primary hover:underline">{m.toolsHealth} →</a
        >
      </CardContent>
    </Card>
  {/if}
{/snippet}

{#snippet activity()}
  <Card>
    <CardHeader><CardTitle>{m.dashboardActivity}</CardTitle></CardHeader>
    <CardContent class="space-y-5 text-sm">
      {@render entries(m.dashboardPublishingSoon, data.activity.soon)}
      {@render entries(m.dashboardRecentlyPublished, data.activity.recent)}
      {#if data.comments?.approvedRecent.length}
        <section>
          <h3 class="mb-2 font-medium">{m.dashboardRecentComments}</h3>
          <ul class="space-y-2">
            {#each data.comments.approvedRecent as comment (comment.id)}
              <li>
                <span class="font-medium">{comment.authorName}</span>
                <span class="text-muted-foreground">·</span>
                <a
                  href={resolve('/admin/(app)/content/[id]', {
                    id: comment.contentId,
                  })}
                  class="text-muted-foreground hover:underline"
                  >{comment.contentTitle}</a
                >
                <p class="line-clamp-2">{comment.body}</p>
              </li>
            {/each}
          </ul>
        </section>
      {/if}
      {#if !data.activity.soon.length && !data.activity.recent.length && !data.comments?.approvedRecent.length}
        <p class="text-muted-foreground">{m.dashboardNoActivity}</p>
      {/if}
    </CardContent>
  </Card>
{/snippet}

{#snippet draft()}
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
{/snippet}

{#snippet comments()}
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
              <span class="text-muted-foreground">·</span>
              <a
                href={resolve('/admin/(app)/content/[id]', {
                  id: comment.contentId,
                })}
                class="text-muted-foreground hover:underline"
                >{comment.contentTitle}</a
              >
              <p class="line-clamp-2">{comment.body}</p>
              <form
                method="POST"
                action="?/moderate"
                use:enhance
                class="mt-1 flex flex-wrap gap-3 text-xs"
              >
                <input type="hidden" name="id" value={comment.id} />
                <button
                  name="action"
                  value="approve"
                  class="text-primary hover:underline"
                  >{m.commentApprove}</button
                >
                <button
                  name="action"
                  value="spam"
                  class="text-destructive hover:underline"
                  >{m.commentMarkSpam}</button
                >
                <button
                  name="action"
                  value="trash"
                  class="text-destructive hover:underline">{m.rowTrash}</button
                >
              </form>
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
{/snippet}
<DashboardOptions
  widgets={available.map((id) => ({ id, title: titleOf(id) }))}
  preferences={data.layout}
  form={form?.dashboardPreferences ? form : null}
/>

<div class="grid gap-6 lg:grid-cols-2">
  {#each visible as id (id)}
    {#if id === 'glance'}
      {@render glance()}
    {:else if id === 'health'}
      {@render health()}
    {:else if id === 'activity'}
      {@render activity()}
    {:else if id === 'draft'}
      {@render draft()}
    {:else if id === 'comments'}
      {@render comments()}
    {:else}
      {@const widget = pluginWidgets.get(id)}
      {#if widget}
        <Card>
          <CardHeader><CardTitle>{widget.title}</CardTitle></CardHeader>
          <CardContent class="space-y-3">
            <AdminBlocks blocks={widget.blocks} />
          </CardContent>
        </Card>
      {/if}
    {/if}
  {/each}
</div>
