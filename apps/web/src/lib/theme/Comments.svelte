<script lang="ts">
  import { resolve } from '$app/paths';
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

  let selectedReply = $state<{ id: string; name: string } | null | undefined>(
    undefined,
  );
  const replyTo = $derived(
    selectedReply === undefined
      ? typed('parentId')
        ? { id: typed('parentId'), name: typed('parentName') }
        : null
      : selectedReply,
  );
  const shown = $derived(
    comments.ownPending
      ? [...comments.items, comments.ownPending]
      : comments.items,
  );
  const remembered = (key: 'authorName' | 'authorEmail' | 'authorUrl') =>
    failure ? typed(key) : (comments.remembered?.[key] ?? '');
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

  {#if shown.length}
    <ol class="space-y-6">
      {#each shown as comment (comment.id)}
        <li
          id="comment-{comment.id}"
          class="space-y-2"
          style:margin-inline-start="{comment.depth * 1.5}rem"
        >
          <p class="text-sm">
            {#if comment.avatarUrl}
              <img
                src={comment.avatarUrl}
                alt=""
                width="48"
                height="48"
                loading="lazy"
                referrerpolicy="no-referrer"
                class="mr-2 inline-block size-12 rounded-full"
              />
            {/if}
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
          {#if comment.pending}<p class="text-sm text-muted-foreground">
              {m.commentAwaitingModeration}
            </p>{/if}
          <p class="whitespace-pre-line">{comment.body}</p>
          {#if !comment.pending && comments.open && (!comments.requireLogin || comments.viewer) && comment.depth + 1 < comments.threadDepth}
            <button
              type="button"
              class="text-sm text-primary hover:underline"
              onclick={() =>
                (selectedReply = { id: comment.id, name: comment.authorName })}
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

  {#if comments.open && comments.requireLogin && !comments.viewer}
    <p>
      <a
        href={resolve('/admin/(auth)/login')}
        class="text-primary hover:underline">{m.commentLoginRequired}</a
      >
    </p>
  {:else if comments.open}
    <!-- Not enhanced: a captcha widget must render fresh after each attempt. -->
    <form
      method="POST"
      action="?/comment&cpage={comments.page}"
      class="space-y-4 rounded-lg border bg-card p-6"
    >
      <h3 class="font-semibold">
        {replyTo ? m.commentReplyTo(replyTo.name) : m.commentLeave}
      </h3>
      {#if replyTo}
        <button
          type="button"
          class="text-sm text-muted-foreground hover:underline"
          onclick={() => (selectedReply = null)}>{m.cancel}</button
        >
      {/if}
      <input type="hidden" name="contentId" value={contentId} />
      <input type="hidden" name="parentId" value={replyTo?.id ?? ''} />
      <input type="hidden" name="parentName" value={replyTo?.name ?? ''} />
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
      {#if comments.viewer}
        <p class="text-sm">{m.commentSignedIn(comments.viewer.name)}</p>
      {:else}
        <div class="grid gap-4 sm:grid-cols-2">
          <label class="grid gap-1 text-sm"
            >{m.commentName}
            <input
              name="authorName"
              required
              maxlength={100}
              autocomplete="name"
              value={remembered('authorName')}
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
              value={remembered('authorEmail')}
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
              value={remembered('authorUrl')}
              class="h-9 rounded-md border bg-background px-3"
            />
          </label>
        </div>
        <label class="flex items-center gap-2 text-sm"
          ><input
            type="checkbox"
            name="remember"
            checked={failure
              ? failure.remember === true
              : !!comments.remembered}
          />{m.commentRemember}</label
        >
      {/if}
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
