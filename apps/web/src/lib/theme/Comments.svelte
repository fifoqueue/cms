<script lang="ts">
  import { routeLink } from '#lib/route-link.js';
  import { resolve } from '$app/paths';
  import type { Path } from '$app/types';
  import { SvelteURLSearchParams } from 'svelte/reactivity';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { default as ListChecks } from '@lucide/svelte/icons/list-checks';
  import { default as Reply } from '@lucide/svelte/icons/reply';
  import { default as Rss } from '@lucide/svelte/icons/rss';
  import { buttonVariants } from '#lib/components/ui/button/button.svelte';
  import CommentBulkBar from '#lib/theme/CommentBulkBar.svelte';
  import CommentForm from '#lib/theme/CommentForm.svelte';
  import type { CommentAuthor } from '#lib/theme/CommentForm.svelte';
  import ConfirmDialog from '#lib/theme/ConfirmDialog.svelte';
  import {
    placeReply,
    REPLY_PARAM,
    revealReply,
  } from '#lib/theme/comment-reply.js';
  import type { ReplyTarget } from '#lib/theme/comment-reply.js';
  import { leaveFor, linkify } from '#lib/theme/comment-text.js';
  import type {
    CommentActionResult,
    CommentManagement,
    CommentSection,
    CommentsView,
  } from '#lib/server/comments.js';
  import CommentModeration from '#lib/theme/CommentModeration.svelte';
  import CommentOrigin from '#lib/theme/CommentOrigin.svelte';
  import { MODERATION_NOTICES } from '#lib/theme/CommentModeration.svelte';
  import type {
    Moderated,
    ModerationStatus,
  } from '#lib/theme/CommentModeration.svelte';
  import { errorMessage } from '#lib/admin/form-errors.js';
  import { useI18n } from '#lib/i18n/index.js';
  import { useDateFormat } from '#lib/theme/format.js';
  import { useScope } from '#lib/theme/scope.js';
  import { forgetParams, notifyFailure, notifySuccess } from '#lib/feedback.js';
  import { onMount, tick, untrack } from 'svelte';

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
  /** The thread most recently returned by a submission or moderation action. */
  let latest = $state.raw<{
    source: CommentSection;
    value: CommentsView;
  } | null>(null);
  const visible = $derived(
    latest?.source === comments ? { ...comments, ...latest.value } : comments,
  );
  let moderated = $state.raw<{
    source: CommentSection;
    management: CommentManagement | null;
    /** Rows no longer public whose thread could not be refreshed. */
    hidden: string[];
  } | null>(null);
  /**
   * Outcomes are toasts once scripts run. Until then (and without them) the redirect's notices
   * and a refused submission show in place.
   */
  let mounted = $state(false);
  onMount(() => {
    mounted = true;
    if (redirectNotice) notifySuccess(m[redirectNotice]);
    if (moderation) notifySuccess(m.commentAwaitingModeration);
    // Without scripts the notices stay in place; with them the toast is the one showing.
    forgetParams('commentNotice', 'moderation');
  });
  /** What a moderation did, counted. */
  const moderatedText = ({ operation, commentIds }: Moderated) =>
    ({
      approve: m.commentsApproved,
      unapprove: m.commentsUnapproved,
      trash: m.commentsTrashed,
      delete: m.commentsDeleted,
    })[operation](commentIds.length);
  const moderatedNow = $derived(
    moderated?.source === comments ? moderated : null,
  );
  // A list that could not be refreshed is dropped rather than shown stale.
  const management = $derived(
    moderatedNow ? moderatedNow.management : comments.management,
  );
  /** After an ordinary-form moderation, the redirect names its notice. */
  const redirectNotice = $derived(
    MODERATION_NOTICES.find(
      (notice) =>
        notice ===
        (page.shallow?.url ?? page.url).searchParams.get('commentNotice'),
    ),
  );
  const moderationFailure = $derived(
    page.form?.moderationFailed === true
      ? (page.form as Record<string, unknown>)
      : null,
  );
  /** One comment action at a time across the form and every moderation control. */
  let moderating = $state(false);
  const onbusy = (busy: boolean) => (moderating = busy);
  const statusOf = (id: string, pending: boolean): ModerationStatus =>
    management?.items.find((item) => item.id === id)?.status ??
    (pending ? 'pending' : 'approved');
  /** Bulk selection mode and the comments chosen in it. */
  let selecting = $state(false);
  let selected = $state<string[]>([]);
  const toggleSelected = (id: string) =>
    (selected = selected.includes(id)
      ? selected.filter((other) => other !== id)
      : [...selected, id]);
  const onmoderated = (result: Moderated) => {
    if (result.comments) latest = { source: comments, value: result.comments };
    moderated = {
      source: comments,
      management: result.management,
      hidden:
        result.comments || result.operation === 'approve'
          ? []
          : [...(moderatedNow?.hidden ?? []), ...result.commentIds],
    };
    notifySuccess(moderatedText(result), {
      description:
        result.comments && result.management
          ? undefined
          : m.moderationRefreshFailed,
    });
    selected = [];
    if (
      result.operation !== 'approve' &&
      reply &&
      result.commentIds.includes(reply.target.id)
    )
      selectedReply = null;
  };
  const moderateAction = $derived.by(() => {
    const search = new SvelteURLSearchParams(page.url.search);
    search.delete('moderation');
    search.delete('commentNotice');
    search.delete(REPLY_PARAM);
    search.set('cpage', String(visible.page));
    return `?/moderateComment&${search}`;
  });
  const badges: Partial<Record<ModerationStatus, string>> = {
    pending:
      'border-amber-500/50 bg-amber-500/10 text-amber-600 dark:text-amber-400',
    spam: 'border-destructive/50 bg-destructive/10 text-destructive',
  };
  const badgeLabel = (status: ModerationStatus) =>
    status === 'spam' ? m.commentSpam : m.commentStatusPending;
  /** A comment form submission is in flight. */
  let submitting = $state(false);
  const action = $derived.by(() => {
    const search = new SvelteURLSearchParams(page.url.search);
    search.set('cpage', String(visible.page));
    search.delete('commentNotice');
    search.delete(REPLY_PARAM);
    return `?/comment&${search}`;
  });
  const scope = useScope();

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

  /** The reply chosen on this page; `null` once cancelled or sent. */
  let selectedReply = $state<ReplyTarget | null | undefined>(undefined);
  const pages = $derived(Math.ceil(visible.total / visible.pageSize));
  /**
   * The public page, with moderators' held (pending and spam) comments placed after their
   * parent's replies; those whose parent is not on this page close the last page.
   */
  const shown = $derived.by(() => {
    const held = management?.items ?? [];
    const thread = (
      visible.ownPending
        ? [...visible.items, visible.ownPending]
        : visible.items
    ).filter((comment) => !held.some((item) => item.id === comment.id));
    for (const item of held) {
      const parent = thread.findIndex(
        (comment) => comment.id === item.parentId,
      );
      if (parent === -1 && visible.page < pages) continue;
      const depth = parent === -1 ? 0 : thread[parent]!.depth + 1;
      let at = parent === -1 ? thread.length : parent + 1;
      while (at < thread.length && thread[at]!.depth >= depth) at++;
      thread.splice(at, 0, {
        id: item.id,
        parentId: item.parentId,
        depth,
        authorName: item.authorName,
        authorUrl: item.authorUrl,
        byAuthor: false,
        avatarUrl: null,
        pending: true,
        body: item.body,
        createdAt: item.createdAt,
      });
    }
    return thread.filter(
      (comment) => !moderatedNow?.hidden.includes(comment.id),
    );
  });
  const canReply = (comment: { pending: boolean; depth: number }) =>
    !comment.pending &&
    visible.open &&
    (!visible.requireLogin || !!visible.viewer) &&
    comment.depth + 1 < visible.threadDepth;
  /** Where the one reply form sits: under the comment it answers. */
  const reply = $derived(
    placeReply(
      shown,
      canReply,
      selectedReply,
      typed('parentId')
        ? { id: typed('parentId'), name: typed('parentName') }
        : null,
      page.url.searchParams.get(REPLY_PARAM),
    ),
  );
  const remembered = (key: 'authorName' | 'authorEmail' | 'authorUrl') =>
    failure ? typed(key) : (comments.remembered?.[key] ?? '');
  /** The visitor's details, shared by both forms; each form keeps its own draft. */
  let author = $state<CommentAuthor>(
    untrack(() => ({
      authorName: remembered('authorName'),
      authorEmail: remembered('authorEmail'),
      authorUrl: remembered('authorUrl'),
      remember: failure ? failure.remember === true : !!comments.remembered,
    })),
  );
  const drafts = $state(
    untrack(() => ({
      main: typed('parentId') ? '' : typed('body'),
      reply: typed('parentId') ? typed('body') : '',
    })),
  );
  /** A refused submission shows in the form that sent it until scripts run. */
  const refusal = (replying: boolean) =>
    failure && !mounted && !!typed('parentId') === replying ? failure : null;
  /** This page's address with `change` applied, without one-off notices. */
  const pageLink = (
    change: (search: SvelteURLSearchParams) => void,
    hash: string,
  ) => {
    const search = new SvelteURLSearchParams(page.url.search);
    search.delete('moderation');
    search.delete('commentNotice');
    change(search);
    return `?${search}#${hash}`;
  };
  const commentLink = (number: number) =>
    pageLink((search) => {
      search.set('cpage', String(number));
      search.delete(REPLY_PARAM);
    }, 'comments');
  const REPLY_FORM = 'comment-reply-form';
  const onreply = async (
    event: MouseEvent,
    comment: { id: string; authorName: string },
  ) => {
    // Modified clicks open the reply link elsewhere, as links do.
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    event.preventDefault();
    selectedReply = { id: comment.id, name: comment.authorName };
    await tick();
    const form = document.getElementById(REPLY_FORM);
    if (form) revealReply(form);
  };
  const onreplycancel = async (id: string) => {
    selectedReply = null;
    await tick();
    document
      .getElementById(`comment-${id}`)
      ?.querySelector<HTMLElement>('[data-reply]')
      ?.focus();
  };
  const onposted = async (result: CommentActionResult) => {
    // Held comments wait for review; the visitor still sees their own below.
    notifySuccess(
      result.moderation ? m.commentAwaitingModeration : m.commentPosted,
      { description: result.comments ? undefined : m.commentRefreshFailed },
    );
    if (result.comments) latest = { source: comments, value: result.comments };
    selectedReply = null;
    await goto(resolve(result.location as Path), {
      state: page.state,
      shallow: true,
      replace: true,
    });
  };
  /** A commenter's link to another site, waiting for the visitor to confirm. */
  let leaving = $state<{ href: string; newTab: boolean } | null>(null);
  let leaveAsked = $state(false);
  const confirmLeave = (
    event: MouseEvent & { currentTarget: HTMLAnchorElement },
  ) => {
    const target = leaveFor(event, event.currentTarget.href, page.url.origin);
    if (!target) return;
    event.preventDefault();
    leaving = target;
    leaveAsked = true;
  };
  const leave = () => {
    if (!leaving) return;
    if (leaving.newTab) window.open(leaving.href, '_blank', 'noopener');
    else window.location.assign(leaving.href);
  };
</script>

{#snippet replyForm(target: ReplyTarget)}
  <CommentForm
    id={REPLY_FORM}
    {contentId}
    section={visible}
    {action}
    replyTo={target}
    bind:author
    bind:body={drafts.reply}
    refusal={refusal(true)}
    {showCaptcha}
    locked={submitting || moderating}
    onbusy={(busy) => (submitting = busy)}
    {onposted}
    cancel={{
      href: pageLink(
        (search) => search.delete(REPLY_PARAM),
        `comment-${target.id}`,
      ),
      onclick: () => onreplycancel(target.id),
    }}
  />
{/snippet}

<section
  id="comments"
  class="mx-auto mt-12 grid max-w-3xl grid-cols-[minmax(0,1fr)] gap-8 border-t pt-8"
  class:pb-28={selecting}
>
  <div class="flex flex-wrap items-center justify-between gap-3">
    <h2 class="text-2xl font-semibold tracking-tight">
      {m.commentCount(visible.count)}
    </h2>
    <div class="flex flex-wrap items-center gap-1">
      {#if management && shown.length}
        <button
          type="button"
          class={buttonVariants({
            variant: 'ghost',
            size: 'sm',
            class: 'text-muted-foreground aria-pressed:bg-muted',
          })}
          aria-pressed={selecting}
          disabled={moderating}
          onclick={() => {
            selecting = !selecting;
            selected = [];
          }}><ListChecks aria-hidden="true" />{m.commentBulkManage}</button
        >
      {/if}
      <a
        class="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        {...routeLink(
          `/comments/feed.xml?contentId=${encodeURIComponent(contentId)}`,
        )}
        type="application/rss+xml"
        ><Rss class="size-4" aria-hidden="true" />{m.privacyCommentFeed}</a
      >
    </div>
  </div>
  {#if moderation && !mounted}
    <p class="rounded-md border bg-card p-3 text-sm" role="status">
      {m.commentAwaitingModeration}
    </p>
  {/if}
  {#if (redirectNotice && !mounted) || moderationFailure}
    <div id="comment-moderation" class="grid min-w-0 gap-4">
      {#if redirectNotice && !mounted}
        <p class="rounded-md border bg-card p-3 text-sm" role="status">
          {m[redirectNotice]}
        </p>
      {/if}
      {#if moderationFailure && !moderatedNow}
        <p
          class="rounded-md border border-destructive/50 p-3 text-sm text-destructive"
          role="alert"
        >
          {errorMessage(m, i18n.language, moderationFailure)}
        </p>
      {/if}
    </div>
  {/if}

  {#if shown.length}
    <!-- One column that never grows past the section (`auto` tracks widen to their widest
         content's minimum size, which some browsers measure larger for form controls). -->
    <ol class="grid grid-cols-[minmax(0,1fr)] gap-6">
      {#each shown as comment (comment.id)}
        {@const origin = management?.origins[comment.id]}
        <li
          id="comment-{comment.id}"
          class={[
            'relative grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2 rounded-lg transition-colors',
            selecting && '-mx-3 px-3 py-2 hover:bg-muted/40',
            selecting && selected.includes(comment.id) && 'bg-muted/60',
          ]}
          style:margin-inline-start="{comment.depth * 1.5}rem"
        >
          {#if selecting && management}
            <!-- The whole row toggles the selection by pointer; the checkbox serves keyboards and assistive technology. -->
            <button
              type="button"
              tabindex="-1"
              aria-hidden="true"
              class="absolute inset-0 z-[1] cursor-pointer rounded-lg"
              disabled={moderating}
              onclick={() => toggleSelected(comment.id)}
            ></button>
          {/if}
          <div class="flex min-w-0 items-start gap-3">
            {#if selecting && management}
              <input
                type="checkbox"
                class="relative z-[2] mt-1 size-4 shrink-0 cursor-pointer accent-primary"
                aria-label={m.commentSelect(comment.authorName)}
                checked={selected.includes(comment.id)}
                disabled={moderating}
                onchange={() => toggleSelected(comment.id)}
              />
            {/if}
            <p class="relative min-w-0 flex-1 text-sm">
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
                ·
                {#if origin}
                  <CommentOrigin id="comment-{comment.id}-origin" {origin}
                    ><time datetime={comment.createdAt}
                      >{formatDate(comment.createdAt)}</time
                    ></CommentOrigin
                  >
                {:else}
                  <time datetime={comment.createdAt}
                    >{formatDate(comment.createdAt)}</time
                  >
                {/if}</span
              >
              {#if management && badges[statusOf(comment.id, comment.pending)]}
                {@const status = statusOf(comment.id, comment.pending)}
                <span
                  class="ml-1.5 inline-block rounded border px-1.5 py-0.5 align-middle text-xs font-medium {badges[
                    status
                  ]}">{badgeLabel(status)}</span
                >
              {/if}
            </p>
            {#if management && !selecting}
              <CommentModeration
                commentId={comment.id}
                {contentId}
                status={statusOf(comment.id, comment.pending)}
                authorName={comment.authorName}
                action={moderateAction}
                {onmoderated}
                onfailed={notifyFailure}
                locked={submitting || moderating}
                {onbusy}
              />
            {/if}
          </div>
          {#if comment.pending && !management}<p
              class="text-sm text-muted-foreground"
            >
              {m.commentAwaitingModeration}
            </p>{/if}
          <p class="whitespace-pre-line">
            {#each linkify(comment.body) as segment, index (index)}{#if segment.href}<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- an address a commenter wrote --><a
                  href={segment.href}
                  rel="nofollow ugc noopener"
                  class="text-primary underline underline-offset-4 wrap-anywhere"
                  onclick={confirmLeave}
                  onauxclick={confirmLeave}>{segment.text}</a
                >{:else}{segment.text}{/if}{/each}
          </p>
          {#if canReply(comment) && !selecting}
            <!-- eslint-disable svelte/no-navigation-without-resolve -- this page with the reply form under the comment -->
            <a
              href={pageLink(
                (search) => search.set(REPLY_PARAM, comment.id),
                REPLY_FORM,
              )}
              data-reply
              aria-controls={REPLY_FORM}
              aria-expanded={reply?.host === comment.id}
              class={buttonVariants({
                variant: 'ghost',
                size: 'xs',
                class: '-ml-2 justify-self-start text-muted-foreground',
              })}
              onclick={(event) => onreply(event, comment)}
              ><Reply aria-hidden="true" />{m.commentReply}</a
            >
            <!-- eslint-enable svelte/no-navigation-without-resolve -->
          {/if}
          {#if reply?.host === comment.id && !selecting}
            {@render replyForm(reply.target)}
          {/if}
        </li>
      {/each}
    </ol>
    {#if visible.truncated}
      <p class="text-sm text-muted-foreground">{m.commentRepliesLimited}</p>
    {/if}
  {/if}

  {#if pages > 1}
    <nav aria-label={m.pagination} class="flex flex-wrap gap-2 text-sm">
      {#each Array.from({ length: pages }, (_, index) => index + 1) as number (number)}
        <!-- eslint-disable svelte/no-navigation-without-resolve -- same page, another comment page -->
        <a
          href={commentLink(number)}
          aria-current={number === visible.page ? 'page' : undefined}
          class="rounded-md border px-3 py-1 aria-[current=page]:bg-muted"
          >{number}</a
        >
        <!-- eslint-enable svelte/no-navigation-without-resolve -->
      {/each}
    </nav>
  {/if}

  {#if visible.open && visible.requireLogin && !visible.viewer}
    <p>
      <a
        href={resolve(
          `${scope().site.loginPath}?${new URLSearchParams({ redirect_to: `${page.url.pathname}${page.url.search}` })}` as Path,
        )}
        class="text-primary hover:underline">{m.commentLoginRequired}</a
      >
    </p>
  {:else if visible.open}
    {#if reply && reply.host === null && !selecting}
      {@render replyForm(reply.target)}
    {/if}
    <CommentForm
      {contentId}
      section={visible}
      {action}
      replyTo={null}
      bind:author
      bind:body={drafts.main}
      refusal={refusal(false)}
      {showCaptcha}
      locked={submitting || moderating}
      onbusy={(busy) => (submitting = busy)}
      {onposted}
    />
  {:else}
    <p class="text-sm text-muted-foreground">{m.commentsClosed}</p>
  {/if}
</section>

<ConfirmDialog
  bind:open={leaveAsked}
  title={m.commentLinkLeave}
  description={m.commentLinkLeaveAsk(leaving?.href ?? '')}
  confirmLabel={m.commentLinkOpen}
  onconfirm={leave}
/>

{#if selecting && management}
  <CommentBulkBar
    {selected}
    selectable={shown.length}
    ontoggleall={(all) =>
      (selected = all ? shown.map((comment) => comment.id) : [])}
    onexit={() => {
      selecting = false;
      selected = [];
    }}
    {contentId}
    action={moderateAction}
    {onmoderated}
    locked={submitting || moderating}
    {onbusy}
  />
{/if}
