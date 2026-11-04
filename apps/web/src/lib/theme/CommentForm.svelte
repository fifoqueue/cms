<script module lang="ts">
  /** What the visitor typed about themselves, shared by the main and reply forms. */
  export interface CommentAuthor {
    authorName: string;
    authorEmail: string;
    authorUrl: string;
    remember: boolean;
  }
</script>

<script lang="ts">
  import { untrack } from 'svelte';
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '$app/forms';
  import { buttonVariants } from '#lib/components/ui/button/button.svelte';
  import { errorMessage } from '#lib/admin/form-errors.js';
  import Captcha from '#lib/security/Captcha.svelte';
  import { useI18n } from '#lib/i18n/context.js';
  import type { CommenterField } from '#lib/i18n/en.js';
  import type {
    CommentActionResult,
    CommentSection,
  } from '#lib/server/comments.js';
  import type { ReplyTarget } from '#lib/theme/comment-reply.js';
  import { CUSTOM_FIELDS_MARKER } from '#lib/theme/comment-fields.js';
  import PrivacyPolicyLink from '#lib/theme/PrivacyPolicyLink.svelte';
  import { notifyFailure } from '#lib/feedback.js';
  import { askPush, enablePush, sendJson } from '#lib/push-client.js';
  import { COMMENT_PUSH_PATH } from '#lib/push.js';

  interface Props {
    id?: string;
    contentId: string;
    section: CommentSection;
    action: string;
    /** A reply form names its comment; the main form starts a thread. */
    replyTo: ReplyTarget | null;
    author: CommentAuthor;
    body: string;
    /** A refusal to show in place, before scripts run. */
    refusal: Record<string, unknown> | null;
    showCaptcha: boolean;
    /** Another comment action on the page is in flight; one runs at a time. */
    locked: boolean;
    onbusy: (busy: boolean) => void;
    onposted: (result: CommentActionResult) => Promise<void>;
    /** Closes a reply form: a link for visitors without scripts, a handler with them. */
    cancel?: { href: string; onclick: () => void };
  }

  let {
    id,
    contentId,
    section,
    action,
    replyTo,
    author = $bindable(),
    body = $bindable(),
    refusal,
    showCaptcha,
    locked,
    onbusy,
    onposted,
    cancel,
  }: Props = $props();

  const i18n = useI18n();
  const m = $derived(i18n.m);
  let submitting = $state(false);
  let captchaReady = $state(false);
  let captchaWidget = $state<ReturnType<typeof Captcha>>();
  const fields = $derived(section.fields);
  const remembered = $derived(
    (['name', 'email', 'website'] as const).filter(
      (field): field is CommenterField => fields[field],
    ),
  );
  /** Answers to the site's comment fields, by key: a refused submission's, else none. */
  const echoed = (failure: Record<string, unknown> | null) => {
    const answers = failure?.fields;

    if (!answers || typeof answers !== 'object') return {};

    return Object.fromEntries(
      Object.entries(answers).filter(
        ([, value]) => typeof value === 'string' || typeof value === 'boolean',
      ),
    ) as Record<string, string | boolean>;
  };
  let answers = $state(untrack(() => echoed(refusal)));
  /** Bumped after a comment is posted, so the field inputs start over empty. */
  let generation = $state(0);
  const inputType = (type: string) =>
    type === 'number' || type === 'date' || type === 'url' ? type : 'text';

  const submit: SubmitFunction<CommentActionResult> = ({ cancel }) => {
    if (submitting || locked || (showCaptcha && !captchaReady)) {
      cancel();

      return;
    }

    // Asked within the submit gesture, without waiting: the comment goes out either way.
    const key = section.notifications.push;
    const permission = key ? askPush() : null;

    submitting = true;
    onbusy(true);

    return async ({ result, update }) => {
      try {
        if (result.type === 'success' && result.data?.commented) {
          body = '';
          answers = {};
          generation += 1;
          const token = result.data.pushToken;

          if (permission && key && token)
            void enablePush(permission, key, (subscription) =>
              sendJson(COMMENT_PUSH_PATH, 'POST', { token, subscription }),
            );
          await onposted(result.data);
        }

        if (result.type === 'failure' && result.data)
          notifyFailure(errorMessage(m, i18n.language, result.data));
        if (result.type === 'error') notifyFailure(m.commentSubmitFailed);
        else
          await update({
            reset: false,
            refreshAll: false,
            navigate: false,
          });
      } finally {
        captchaWidget?.reset();
        submitting = false;
        onbusy(false);
      }
    };
  };
</script>

<form
  {id}
  method="POST"
  {action}
  aria-busy={submitting}
  use:enhance={submit}
  class="rounded-lg border bg-card p-4 @min-[40rem]:p-6"
>
  <fieldset
    disabled={submitting}
    class="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4"
  >
    <h3 class="font-semibold">
      {replyTo ? m.commentReplyTo(replyTo.name) : m.commentLeave}
    </h3>
    <input type="hidden" name="contentId" value={contentId} />
    <input type="hidden" name="parentId" value={replyTo?.id ?? ''} />
    <input type="hidden" name="parentName" value={replyTo?.name ?? ''} />
    <!-- People never see this field; automated senders fill it in. -->
    <div class="absolute -left-[9999px]" aria-hidden="true">
      <label
        >{m.commentWebsite}
        <input name="website" tabindex="-1" autocomplete="off" /></label
      >
    </div>
    {#if refusal && typeof refusal.message === 'string'}
      <p class="text-sm text-destructive" role="alert">
        {errorMessage(m, i18n.language, refusal)}
      </p>
    {/if}
    {#if section.viewer}
      <p class="text-sm">{m.commentSignedIn(section.viewer.name)}</p>
    {:else}
      <div
        class="grid grid-cols-[minmax(0,1fr)] gap-4 @min-[40rem]:grid-cols-2"
      >
        {#if fields.name}
          <label class="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1 text-sm"
            >{m.commentName}
            <input
              name="authorName"
              required
              maxlength={100}
              autocomplete="name"
              bind:value={author.authorName}
              class="h-9 rounded-md border bg-background px-3"
            />
          </label>
        {/if}
        {#if fields.email}
          <label class="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1 text-sm"
            >{m.commentEmail}
            <input
              name="authorEmail"
              type="email"
              required
              maxlength={191}
              autocomplete="email"
              bind:value={author.authorEmail}
              class="h-9 rounded-md border bg-background px-3"
            />
            {#if section.notifications.email}<span
                class="text-xs text-muted-foreground"
                >{m.commentEmailNotify}</span
              >{/if}
          </label>
        {/if}
        {#if fields.website}
          <label
            class="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1 text-sm @min-[40rem]:col-span-2"
            >{m.commentWebsite}
            <input
              name="authorUrl"
              type="url"
              maxlength={255}
              autocomplete="url"
              bind:value={author.authorUrl}
              class="h-9 rounded-md border bg-background px-3"
            />
          </label>
        {/if}
      </div>
      {#if section.commentCookies && remembered.length}
        <label class="flex items-start gap-2 text-sm"
          ><input
            type="checkbox"
            name="remember"
            class="mt-0.5 shrink-0"
            bind:checked={author.remember}
          />{m.commentRemember(remembered)}</label
        >
      {/if}
    {/if}
    {#if section.customFields.length}
      <input type="hidden" name={CUSTOM_FIELDS_MARKER} value="1" />
      {#key generation}
        <div
          class="grid grid-cols-[minmax(0,1fr)] gap-4 @min-[40rem]:grid-cols-2"
        >
          {#each section.customFields as field (field.key)}
            {@const name = `field.${field.key}`}
            {@const value = answers[field.key]}
            {@const text = typeof value === 'string' ? value : ''}
            {#if field.type === 'boolean'}
              <label
                class="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-start gap-x-2 gap-y-1 text-sm @min-[40rem]:col-span-2"
                ><input
                  type="checkbox"
                  {name}
                  checked={value === true}
                  class="mt-0.5"
                />{field.label}
                {#if field.help}<span
                    class="col-start-2 text-xs text-muted-foreground"
                    >{field.help}</span
                  >{/if}
              </label>
            {:else}
              <label
                class="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1 text-sm {field.type ===
                'textarea'
                  ? '@min-[40rem]:col-span-2'
                  : ''}"
                >{field.label}
                {#if field.type === 'textarea'}
                  <textarea
                    {name}
                    required={field.required}
                    maxlength={20000}
                    rows={3}
                    value={text}
                    class="rounded-md border bg-background p-3"></textarea>
                {:else if field.type === 'select'}
                  <select
                    {name}
                    required={field.required}
                    value={text}
                    class="h-9 rounded-md border bg-background px-3"
                  >
                    <option value="">{m.noChoice}</option>
                    {#each field.options as option, index (index)}
                      <option value={option}>{option}</option>
                    {/each}
                  </select>
                {:else}
                  <input
                    {name}
                    type={inputType(field.type)}
                    step={field.type === 'number' ? 'any' : undefined}
                    maxlength={field.type === 'url'
                      ? 2048
                      : field.type === 'text'
                        ? 1000
                        : undefined}
                    required={field.required}
                    value={text}
                    class="h-9 rounded-md border bg-background px-3"
                  />
                {/if}
                {#if field.help}<span class="text-xs text-muted-foreground"
                    >{field.help}</span
                  >{/if}
              </label>
            {/if}
          {/each}
        </div>
      {/key}
    {/if}
    <label class="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1 text-sm"
      >{m.commentBody}
      <textarea
        name="body"
        required
        maxlength={5000}
        rows={5}
        bind:value={body}
        class="rounded-md border bg-background p-3"></textarea>
    </label>
    {#if fields.email && !section.viewer}<p
        class="text-xs text-muted-foreground"
      >
        {m.commentEmailPrivate}
      </p>{/if}
    <PrivacyPolicyLink policy={section.privacyPolicy} />
    {#if showCaptcha && section.captcha}
      <Captcha
        bind:this={captchaWidget}
        captcha={section.captcha}
        onchange={(ready) => (captchaReady = ready)}
      />
    {/if}
    <div class="flex flex-wrap items-center gap-2">
      <button
        type="submit"
        disabled={submitting || locked || (showCaptcha && !captchaReady)}
        class="h-9 rounded-md bg-primary px-4 text-sm text-primary-foreground"
        >{submitting ? m.commentSubmitting : m.commentSubmit}</button
      >
      {#if cancel}
        <!-- eslint-disable svelte/no-navigation-without-resolve -- the same page without the reply -->
        <a
          href={cancel.href}
          class={buttonVariants({
            variant: 'outline',
            class: 'cms-comment-cancel px-4',
          })}
          onclick={(event) => {
            event.preventDefault();
            cancel.onclick();
          }}>{m.cancel}</a
        >
        <!-- eslint-enable svelte/no-navigation-without-resolve -->
      {/if}
    </div>
  </fieldset>
</form>
