<script lang="ts">
  import { page } from '$app/state';
  import type { CommentSection } from '#lib/server/comments.js';
  import Captcha from '#lib/security/Captcha.svelte';
  import { useI18n } from '#lib/i18n/index.js';
  import { useDateFormat } from '#lib/theme/format.js';

  interface Props {
    contentId: string;
    comments: CommentSection;
    /** A held comment was just sent. */
    moderation: boolean;
  }

  let { contentId, comments, moderation }: Props = $props();

  const i18n = useI18n();
  const m = $derived(i18n.m);
  const formatDate = useDateFormat();

  const failure = $derived(
    page.form && 'authorName' in page.form
      ? (page.form as Record<string, unknown>)
      : null,
  );
  const typed = (key: string) =>
    typeof failure?.[key] === 'string' ? (failure[key] as string) : '';
  const showCaptcha = $derived(
    !!comments.captcha &&
      comments.captcha.provider !== 'none' &&
      (comments.captcha.always.includes('comment') ||
        failure?.captcha === true),
  );

  let replyTo = $state<{ id: string; name: string } | null>(null);
  const pages = $derived(Math.ceil(comments.total / comments.pageSize));
</script>

<section id="comments" class="mx-auto mt-12 max-w-3xl space-y-8 border-t pt-8">
  <h2 class="text-2xl font-semibold tracking-tight">
    {m.commentCount(comments.count)}
  </h2>

  {#if moderation}
    <p class="rounded-md border bg-card p-3 text-sm" role="status">
      {m.commentAwaitingModeration}
    </p>
  {/if}

  {#if comments.items.length}
    <ol class="space-y-6">
      {#each comments.items as comment (comment.id)}
        <li
          id="comment-{comment.id}"
          class="space-y-2"
          style:margin-inline-start="{comment.depth * 1.5}rem"
        >
          <p class="text-sm">
            {#if comment.authorUrl}
              <!-- eslint-disable svelte/no-navigation-without-resolve -- a commenter's own website -->
              <a
                href={comment.authorUrl}
                rel="nofollow ugc noopener"
                class="font-medium hover:underline">{comment.authorName}</a
              >
              <!-- eslint-enable svelte/no-navigation-without-resolve -->
            {:else}
              <span class="font-medium">{comment.authorName}</span>
            {/if}
            {#if comment.byAuthor}
              <span class="ml-1 rounded bg-muted px-1.5 py-0.5 text-xs"
                >{m.commentByAuthor}</span
              >
            {/if}
            <span class="text-muted-foreground">
              · <time datetime={comment.createdAt}
                >{formatDate(comment.createdAt)}</time
              ></span
            >
          </p>
          <p class="whitespace-pre-line">{comment.body}</p>
          {#if comments.open && comment.depth + 1 < comments.threadDepth}
            <button
              type="button"
              class="text-sm text-primary hover:underline"
              onclick={() =>
                (replyTo = { id: comment.id, name: comment.authorName })}
              >{m.commentReply}</button
            >
          {/if}
        </li>
      {/each}
    </ol>
    {#if comments.truncated}
      <p class="text-sm text-muted-foreground">{m.commentRepliesLimited}</p>
    {/if}
  {/if}

  {#if pages > 1}
    <nav aria-label={m.pagination} class="flex flex-wrap gap-2 text-sm">
      {#each Array.from({ length: pages }, (_, index) => index + 1) as number (number)}
        <!-- eslint-disable svelte/no-navigation-without-resolve -- same page, another comment page -->
        <a
          href="?cpage={number}#comments"
          aria-current={number === comments.page ? 'page' : undefined}
          class="rounded-md border px-3 py-1 aria-[current=page]:bg-muted"
          >{number}</a
        >
        <!-- eslint-enable svelte/no-navigation-without-resolve -->
      {/each}
    </nav>
  {/if}

  {#if comments.open}
    <!-- Not enhanced: a captcha widget must render fresh after each attempt. -->
    <form
      method="POST"
      action="?/comment"
      class="space-y-4 rounded-lg border bg-card p-6"
    >
      <h3 class="font-semibold">
        {replyTo ? m.commentReplyTo(replyTo.name) : m.commentLeave}
      </h3>
      {#if replyTo}
        <button
          type="button"
          class="text-sm text-muted-foreground hover:underline"
          onclick={() => (replyTo = null)}>{m.cancel}</button
        >
      {/if}
      <input type="hidden" name="contentId" value={contentId} />
      <input type="hidden" name="parentId" value={replyTo?.id ?? ''} />
      <!-- People never see this field; automated senders fill it in. -->
      <div class="absolute -left-[9999px]" aria-hidden="true">
        <label
          >Website <input
            name="website"
            tabindex="-1"
            autocomplete="off"
          /></label
        >
      </div>
      {#if failure && typeof failure.message === 'string'}
        <p class="text-sm text-destructive" role="alert">{failure.message}</p>
      {/if}
      <div class="grid gap-4 sm:grid-cols-2">
        <label class="grid gap-1 text-sm"
          >{m.commentName}
          <input
            name="authorName"
            required
            maxlength={100}
            autocomplete="name"
            value={typed('authorName')}
            class="h-9 rounded-md border bg-background px-3"
          />
        </label>
        <label class="grid gap-1 text-sm"
          >{m.commentEmail}
          <input
            name="authorEmail"
            type="email"
            required
            maxlength={191}
            autocomplete="email"
            value={typed('authorEmail')}
            class="h-9 rounded-md border bg-background px-3"
          />
        </label>
        <label class="grid gap-1 text-sm sm:col-span-2"
          >{m.commentWebsite}
          <input
            name="authorUrl"
            type="url"
            maxlength={255}
            autocomplete="url"
            value={typed('authorUrl')}
            class="h-9 rounded-md border bg-background px-3"
          />
        </label>
      </div>
      <label class="grid gap-1 text-sm"
        >{m.commentBody}
        <textarea
          name="body"
          required
          maxlength={5000}
          rows={5}
          class="rounded-md border bg-background p-3">{typed('body')}</textarea
        >
      </label>
      <p class="text-xs text-muted-foreground">{m.commentEmailPrivate}</p>
      {#if showCaptcha && comments.captcha}
        <Captcha captcha={comments.captcha} />
      {/if}
      <button
        type="submit"
        class="h-9 rounded-md bg-primary px-4 text-sm text-primary-foreground"
        >{m.commentSubmit}</button
      >
    </form>
  {:else}
    <p class="text-sm text-muted-foreground">{m.commentsClosed}</p>
  {/if}
</section>
