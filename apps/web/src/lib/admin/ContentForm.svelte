<script lang="ts">
  import { thumbnailUrl } from '#lib/admin/media-thumbnail.js';
  import { localTime } from '#lib/admin/local-time.js';
  import type { Path } from '$app/types';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '$app/forms';
  import {
    DEFAULT_ENTRY_SEO,
    autosaveInputSchema,
    contentDocumentSchema,
    renderPermalink,
  } from '@cms/sdk';
  import type {
    ContentDocument,
    ContentEntry,
    ContentStatus,
    ContentType,
    ContentTypeDefinition,
    FieldDefinition,
  } from '@cms/sdk';
  import { permalinkPatternFor } from '@cms/sdk';
  import type { AuthorOption } from '@cms/sdk/client';
  import { X } from '@lucide/svelte';
  import { onDestroy, onMount, untrack } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import type { ContentFormValues } from '#lib/admin/content-form-values.js';
  import Editor from '#lib/admin/Editor.svelte';
  import MediaPicker from '#lib/admin/MediaPicker.svelte';
  import SeoEditor from '#lib/admin/SeoEditor.svelte';
  import type { SeoPreviewContext } from '#lib/admin/seo.js';
  import { documentText, seoFormValues } from '#lib/admin/seo.js';
  import { flattenTree } from '#lib/admin/taxonomy-tree.js';
  import { editorBackup } from '#lib/admin/editor-backup.js';
  import FormMessage from '#lib/admin/FormMessage.svelte';
  import { confirmLeave } from '#lib/admin/unsaved.js';
  import {
    forgetParams,
    notifyFailure,
    notifyQuietly,
    notifySuccess,
  } from '#lib/feedback.js';
  import type { ActionData } from '#lib/feedback.js';
  import { Alert, AlertTitle } from '#lib/components/ui/alert/index.js';
  import { Badge } from '#lib/components/ui/badge/index.js';
  import { Button } from '#lib/components/ui/button/index.js';
  import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
  } from '#lib/components/ui/card/index.js';
  import { Input } from '#lib/components/ui/input/index.js';
  import { Label } from '#lib/components/ui/label/index.js';
  import {
    NativeSelect,
    NativeSelectOption,
  } from '#lib/components/ui/native-select/index.js';
  import { Textarea } from '#lib/components/ui/textarea/index.js';
  import { statusLabel, typeLabel, useI18n } from '#lib/i18n/index.js';

  interface TermOption {
    id: string;
    name: string;
    parentId: string | null;
    menuOrder?: number;
  }

  interface Props {
    entry?: ContentEntry;
    /** What a failed save submitted; takes precedence over `entry`. */
    values?: ContentFormValues;
    /** Text to start from instead of the entry's (a loaded autosave). */
    draft?: { title: string; excerpt: string; document: ContentDocument };
    type?: ContentType;
    parentPages?: { id: string; title: string }[];
    extraTaxonomies?: { key: string; name: string; terms: TermOption[] }[];
    categories: TermOption[];
    tags: TermOption[];
    seo: SeoPreviewContext;
    /** Content types and custom field definitions. */
    model: { types: ContentTypeDefinition[]; fields: FieldDefinition[] };
    /** Choices for the author; null when the user may not assign other authors. */
    authors: AuthorOption[] | null;
    /** Whether the user may publish, schedule or make entries private. */
    canPublish: boolean;
    /** Whether the user may add categories and tags. */
    canManageTerms?: boolean;
    /** The signed-in user; browser backups belong to this account. */
    userId: string;
    /** Author of a new entry: the signed-in user. */
    defaultAuthorId?: string;
    /** Thumbnail addresses of the saved image fields, by field key. */
    fieldImages?: Record<string, string>;
    /** Settings → Writing: what a new entry starts with. */
    defaults?: { categoryId: string | null; status: 'draft' | 'pending' };
    /** Saved versions of the entry, for the "Browse" link. */
    revisionCount?: number;
    /** Status a new entry was just created with (shown as the save result). */
    created?: string | null;
  }

  let {
    entry,
    values,
    draft,
    type = 'post',
    parentPages = [],
    extraTaxonomies = [],
    categories,
    tags,
    seo,
    model,
    authors,
    canPublish,
    canManageTerms = false,
    userId,
    defaultAuthorId = '',
    fieldImages = {},
    revisionCount = 0,
    defaults,
    created = null,
  }: Props = $props();

  const i18n = useI18n();
  const m = $derived(i18n.m);
  const loginPath = $derived(
    (page.data as { loginPath?: string }).loginPath ?? '/login',
  );
  const resolvedLoginPath = $derived(resolve(loginPath as Path));

  const EMPTY: ContentDocument = {
    type: 'doc',
    content: [{ type: 'paragraph' }],
  };
  /** Statuses after which the entry is out of the draft workflow. */
  const LIVE: readonly ContentStatus[] = ['published', 'private', 'scheduled'];

  // Initial values only; the form owns the state afterwards.
  const initial = untrack(() => ({
    type: values?.type ?? entry?.type ?? type,
    title: values?.title ?? draft?.title ?? entry?.title ?? '',
    slug: values?.slug ?? entry?.slug ?? '',
    excerpt: values?.excerpt ?? draft?.excerpt ?? entry?.excerpt ?? '',
    status: (values?.status ??
      entry?.status ??
      defaults?.status ??
      'draft') as ContentStatus,
    publishedAt: localTime(values?.publishedAt || entry?.publishedAt),
    sticky: values?.sticky ?? entry?.sticky ?? false,
    allowComments: values?.allowComments ?? entry?.allowComments ?? true,
    authorId: values?.authorId || entry?.authorId || defaultAuthorId,
    document:
      contentDocumentSchema.safeParse(values?.document).data ??
      draft?.document ??
      entry?.document ??
      EMPTY,
    categoryIds: new Set(
      values?.categoryIds ??
        entry?.categories.map(({ id }) => id) ??
        (defaults?.categoryId ? [defaults.categoryId] : []),
    ),
    tagIds: new Set(values?.tagIds ?? entry?.tags.map(({ id }) => id) ?? []),
    parentId: values?.parentId ?? entry?.parentId ?? '',
    menuOrder: values?.menuOrder ?? entry?.menuOrder ?? 0,
    extraTermIds: new Set(
      values?.extraTermIds ?? entry?.extraTerms.map(({ id }) => id) ?? [],
    ),
    seo: values?.seo ?? seoFormValues(entry?.seo ?? DEFAULT_ENTRY_SEO),
    fields: values?.fields ?? entry?.fields ?? {},
  }));
  let body = $state(initial.document);
  /** The saved version the form's text is based on (`expectedUpdatedAt`). */
  let version = $state(untrack(() => entry?.updatedAt ?? ''));
  // Remounts the editor when a browser backup is restored.
  let editorKey = $state(0);
  // Live fields the SEO previews and autosave follow.
  let title = $state(initial.title);
  let slug = $state(initial.slug);
  let editingSlug = $state(false);
  let excerpt = $state(initial.excerpt);
  let contentType = $state(initial.type);
  let publishAt = $state(initial.publishedAt);
  let draftStatus = $state<ContentStatus>(
    initial.status === 'pending' ? 'pending' : 'draft',
  );
  let visibility = $state<'public' | 'password' | 'private'>(
    untrack(() =>
      initial.status === 'private'
        ? 'private'
        : entry?.protected
          ? 'password'
          : 'public',
    ),
  );
  let featured = $state(
    untrack(() => {
      const id = values ? values.featuredMediaId : entry?.featuredMediaId;
      if (!id) return null;
      // A failed save may echo another image than the saved one; its preview then follows on save.
      const image =
        id === entry?.featuredMediaId ? entry.featuredImage : undefined;
      return {
        id,
        url: image ? (image.sizes[0]?.url ?? image.url) : '',
        alt: image?.alt ?? '',
      };
    }),
  );
  let featuredPicker: ReturnType<typeof MediaPicker>;

  const isLive = $derived(!!entry && LIVE.includes(entry.status));
  const future = $derived(
    publishAt !== '' && new Date(publishAt).getTime() > Date.now(),
  );
  /** What the main button saves. */
  const primaryStatus = $derived<ContentStatus>(
    !canPublish
      ? isLive && entry
        ? entry.status
        : 'pending'
      : visibility === 'private'
        ? 'private'
        : future
          ? 'scheduled'
          : 'published',
  );
  const primaryLabel = $derived(
    !canPublish
      ? isLive
        ? m.update
        : m.submitForReview
      : isLive && primaryStatus === entry?.status
        ? m.update
        : primaryStatus === 'scheduled'
          ? m.schedule
          : isLive
            ? m.update
            : m.publish,
  );
  /** What Enter and Ctrl+S save: a draft stays a draft, a live entry is updated. */
  const defaultStatus = $derived(isLive ? primaryStatus : draftStatus);
  // The minute input cannot show seconds: an untouched date resends the stored time exactly.
  const publishedAt = $derived(
    !publishAt
      ? ''
      : entry?.publishedAt && publishAt === localTime(entry.publishedAt)
        ? entry.publishedAt
        : new Date(publishAt).toISOString(),
  );

  const bodyText = $derived(documentText(body).text);
  const words = $derived(bodyText.split(/\s+/).filter(Boolean).length);
  const pattern = $derived(permalinkPatternFor(seo.permalinks, contentType));
  const typeInfo = $derived(
    model.types.find((option) => option.key === contentType),
  );
  const supports = $derived(
    typeInfo?.supports ?? {
      categories: true,
      tags: true,
      comments: true,
      featuredImage: true,
    },
  );
  const typeFields = $derived(
    model.fields.filter((field) => field.contentTypes.includes(contentType)),
  );
  /** Image field values (media ids) chosen in this form, by field key. */
  let imageFields = $state<Record<string, { id: string; url: string } | null>>(
    untrack(() =>
      Object.fromEntries(
        model.fields
          .filter((field) => field.type === 'image')
          .map((field) => {
            const id = initial.fields[field.key];
            return [
              field.key,
              typeof id === 'string'
                ? { id, url: fieldImages[field.key] ?? '' }
                : null,
            ];
          }),
      ),
    ),
  );
  let fieldPicker = $state<ReturnType<typeof MediaPicker>>();
  let pickingField = '';
  const fieldValue = (key: string) => initial.fields[key];
  // Saved entries preview their address; new ones get theirs on save.
  const path = $derived(
    entry
      ? renderPermalink(pattern, {
          timeZone: seo.timeZone,
          id: entry.id,
          slug: slug.trim() || entry.slug,
          title: title.trim() || entry.title,
          publishedAt: entry.publishedAt,
          createdAt: entry.createdAt,
        })
      : null,
  );

  // Terms added here join the lists; categories start checked.
  let categoryList = $state(untrack(() => [...categories]));
  let tagList = $state(untrack(() => [...tags]));
  const addedCategories = new SvelteSet<string>();
  const categoryRows = $derived(flattenTree(categoryList));
  let chosenTags = $state(
    untrack(() => tags.filter((tag) => initial.tagIds.has(tag.id))),
  );
  let tagText = $state('');
  let tagError = $state('');
  let addingCategory = $state(false);
  let categoryName = $state('');
  let categoryParent = $state('');
  let categoryError = $state('');

  const createTerm = async (
    taxonomy: 'category' | 'tag',
    name: string,
    parentId: string | null,
  ): Promise<TermOption | null> => {
    const response = await fetch('/admin/content/terms', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ taxonomy, name, parentId }),
    }).catch(() => null);
    return response?.status === 201
      ? ((await response.json()) as TermOption)
      : null;
  };

  const addTags = async () => {
    tagError = '';
    const names = tagText
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean);
    tagText = '';
    for (const name of names) {
      let tag = tagList.find(
        (option) => option.name.toLowerCase() === name.toLowerCase(),
      );
      if (!tag && canManageTerms) {
        tag = (await createTerm('tag', name, null)) ?? undefined;
        if (tag) tagList.push(tag);
        else tagError = m.termCreateFailed;
      } else if (!tag) tagError = m.termUnknown(name);
      if (tag && !chosenTags.some((option) => option.id === tag.id)) {
        chosenTags.push(tag);
        touch();
      }
    }
  };

  const addCategory = async () => {
    const name = categoryName.trim();
    if (!name) return;
    categoryError = '';
    const category = await createTerm('category', name, categoryParent || null);
    if (!category) {
      categoryError = m.termCreateFailed;
      return;
    }
    addedCategories.add(category.id);
    categoryList.push(category);
    categoryName = '';
    touch();
  };

  // Unsaved changes: the text against what was last saved, plus a count of other edits. A save
  // marks clean only what it sent, so edits made while it runs stay unsaved.
  const snapshot = () => JSON.stringify([title, excerpt, body]);
  let savedText = untrack(snapshot);
  let edits = $state(0);
  let savedEdits = 0;
  const touch = () => edits++;
  let saving = $state(false);
  const isDirty = () => edits !== savedEdits || snapshot() !== savedText;
  confirmLeave(isDirty, () => m.unsavedLeave);

  // A browser copy of the text survives an expired session, a crash or a reload.
  const backupStore = untrack(() =>
    editorBackup(userId, entry?.id ?? `new:${type}`),
  );
  let backup = $state<{
    title: string;
    excerpt: string;
    document: ContentDocument;
  } | null>(null);
  $effect(() => {
    const text = snapshot();
    const timer = setTimeout(() => {
      if (text !== savedText) backupStore.write(text);
    }, 1000);
    return () => clearTimeout(timer);
  });
  onMount(() => {
    const raw = backupStore.read();
    if (!raw || raw === savedText) return;
    try {
      const [savedTitle, savedExcerpt, document] = JSON.parse(raw) as unknown[];
      const parsed = contentDocumentSchema.safeParse(document);
      if (
        typeof savedTitle === 'string' &&
        typeof savedExcerpt === 'string' &&
        parsed.success
      )
        backup = {
          title: savedTitle,
          excerpt: savedExcerpt,
          document: parsed.data,
        };
    } catch {
      // An unreadable backup is ignored.
    }
  });
  const restoreBackup = () => {
    if (!backup) return;
    ({ title, excerpt } = backup);
    body = backup.document;
    editorKey++;
    backup = null;
  };
  const dismissBackup = () => {
    backup = null;
    backupStore.remove();
  };

  let expiredDialog: HTMLDialogElement;
  const sessionExpired = () => {
    if (!expiredDialog.open) expiredDialog.showModal();
  };

  // Autosave: every 30 seconds while the text differs from what was last kept. Autosaves,
  // previews and saves run one after another, so an older write never lands after a newer one.
  let kept = savedText;
  let queue: Promise<unknown> = Promise.resolve();
  /** Stores the current text as the user's autosave; resolves once the server has it. */
  const keepText = async (id: string) => {
    const current = snapshot();
    if (current === kept) return true;
    const response = await fetch(`/admin/content/${id}/autosave`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title, excerpt, document: body }),
    }).catch(() => null);
    // An expired session answers with the sign-in page.
    if (response?.redirected) sessionExpired();
    const ok = !!response?.ok && !response.redirected;
    if (ok) {
      kept = current;
      notifyQuietly(
        m.autosaveSaved(new Date().toLocaleTimeString(i18n.language)),
        'autosave',
      );
    } else notifyFailure(m.autosaveFailed);
    return ok;
  };
  const autosave = () => {
    if (!entry || saving) return;
    const id = entry.id;
    queue = queue.then(() => keepText(id));
  };
  const timer = setInterval(autosave, 30_000);
  onDestroy(() => clearInterval(timer));

  let previewForm = $state<HTMLFormElement>();
  /**
   * Opens the preview tab at once (popup rules). The text is stored as an autosave first, and
   * only then is the preview requested; the preview request itself writes nothing.
   */
  const preview = () => {
    // A save in flight would clear the autosave the preview is about to show.
    if (!entry || !previewForm || saving) return;
    if (
      !autosaveInputSchema.safeParse({ title, excerpt, document: body }).success
    ) {
      notifyFailure(m.previewInvalid);
      return;
    }
    const target = `cms-preview-${entry.id}`;
    const tab = window.open('about:blank', target);
    const form = previewForm;
    const id = entry.id;
    form.target = target;
    queue = queue.then(async () => {
      if (await keepText(id)) form.submit();
      else tab?.close();
    });
  };

  /** What a save did: the saved status against what the entry was before. */
  const savedNotice = (status: string, previous?: string) => {
    if (status === 'draft') return m.entryDraftSaved;
    if (status === previous) return m.entryUpdated;
    if (status === 'pending') return m.entrySubmitted;
    if (status === 'published') return m.entryPublished;
    if (status === 'scheduled') return m.entryScheduled;
    return m.entryUpdated;
  };
  /** Announces a save; a first publication offers to view the entry. */
  const announceSave = (status: string, previous?: string) => {
    const path = entry?.path;
    notifySuccess(savedNotice(status, previous), {
      action:
        status === 'published' &&
        previous !== 'published' &&
        entry?.status === 'published' &&
        path
          ? {
              label: m.view,
              onClick: () => window.open(resolve(path as Path), '_blank'),
            }
          : undefined,
    });
  };
  // A new entry arrives here after its first save (`?saved=<status>`, shown once).
  onMount(() => {
    if (!created) return;
    announceSave(created);
    forgetParams('saved');
  });
  let saveBar = $state<HTMLElement>();
  // Small screens: toasts rise above the fixed save bar (0 while the bar is hidden).
  $effect(() => {
    if (!saveBar) return;
    const bar = saveBar;
    const root = document.documentElement;
    const observer = new ResizeObserver(() =>
      root.style.setProperty('--cms-save-bar-offset', `${bar.offsetHeight}px`),
    );
    observer.observe(bar);
    return () => {
      observer.disconnect();
      root.style.removeProperty('--cms-save-bar-offset');
    };
  });
  /** The last refused save; its field issues show by the save button. */
  let saveFailure = $state.raw<ActionData | null>(null);

  let formElement: HTMLFormElement;
  const submit: SubmitFunction = async () => {
    const previous = entry?.status;
    const sent = { text: snapshot(), edits, draftStatus };
    saving = true;
    saveFailure = null;
    // A queued autosave finishes first, so it cannot land after (and outdate) this save.
    await queue;
    return async ({ result: outcome, update }) => {
      if (
        outcome.type === 'redirect' &&
        (outcome.location === resolvedLoginPath ||
          outcome.location.startsWith(`${resolvedLoginPath}?`))
      ) {
        saving = false;
        sessionExpired();
        return;
      }
      if (outcome.type === 'error') {
        saving = false;
        notifyFailure(m.saveFailed);
        return;
      }
      if (outcome.type === 'failure') {
        if (outcome.data?.stale) notifyFailure(m.entryConflict);
        else saveFailure = (outcome.data ?? {}) as ActionData;
      } else {
        // Before `update`: a new entry's redirect must not ask about the text it just saved.
        savedText = kept = sent.text;
        savedEdits = sent.edits;
        if (edits === sent.edits && snapshot() === sent.text)
          backupStore.remove();
      }
      await update({ reset: false });
      saving = false;
      if (outcome.type !== 'success') return;
      const saved = outcome.data as
        { version?: string; status?: ContentStatus } | undefined;
      // The version this form's text now matches: only what this save returned, never a
      // refreshed entry that someone else may have saved meanwhile.
      if (saved?.version) version = saved.version;
      const status = saved?.status ?? entry?.status;
      if (!status) return;
      // What the server stored, which can differ from the button (a past date publishes).
      announceSave(status, previous);
      if (
        draftStatus === sent.draftStatus &&
        (status === 'draft' || status === 'pending')
      )
        draftStatus = status;
    };
  };

  const shortcut = (event: KeyboardEvent) => {
    if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 's')
      return;
    event.preventDefault();
    if (!saving)
      formElement.requestSubmit(
        formElement.querySelector<HTMLButtonElement>('button[data-default]'),
      );
  };
</script>

<svelte:window onkeydown={shortcut} />

{#snippet saveButtons(compact: boolean)}
  <!-- The card shows "Save draft" at its top, like WordPress; the mobile bar needs both. -->
  {#if compact && !isLive}
    <Button
      type="submit"
      name="status"
      value={draftStatus}
      variant="outline"
      size={compact ? 'sm' : 'default'}
      disabled={saving}
      >{draftStatus === 'pending' ? m.saveAsPending : m.saveDraft}</Button
    >
  {/if}
  <Button
    type="submit"
    name="status"
    value={primaryStatus}
    size={compact ? 'sm' : 'default'}
    class={compact ? '' : 'w-full'}
    disabled={saving}>{primaryLabel}</Button
  >
{/snippet}

{#if backup}
  <Alert class="mb-6">
    <AlertTitle class="flex flex-wrap items-center justify-between gap-2">
      {m.backupFound}
      <span class="flex gap-2">
        <Button size="sm" onclick={restoreBackup}>{m.backupRestore}</Button>
        <Button size="sm" variant="ghost" onclick={dismissBackup}
          >{m.dismiss}</Button
        >
      </span>
    </AlertTitle>
  </Alert>
{/if}

<form
  bind:this={formElement}
  method="POST"
  action="?/save"
  use:enhance={submit}
  oninput={touch}
  onchange={touch}
  class="grid gap-6 pb-20 lg:grid-cols-[minmax(0,1fr)_18rem] lg:pb-0"
>
  <!-- First submit button: what Enter in a field saves. -->
  <button
    type="submit"
    name="status"
    value={defaultStatus}
    data-default
    hidden
    tabindex="-1"
    aria-hidden="true"
  ></button>
  <div class="min-w-0 space-y-6">
    <div class="grid gap-2">
      <Label for="title">{m.fieldTitle}</Label>
      <Input
        id="title"
        name="title"
        required
        maxlength={255}
        bind:value={title}
      />
      <input type="hidden" name="slug" value={slug} />
      <!-- The version this form edits: the API refuses the save when someone saved since. -->
      {#if entry}<input type="hidden" name="updatedAt" value={version} />{/if}
      {#if entry && path && !editingSlug}
        {@const address = `${seo.siteUrl.replace(/\/$/, '')}${path}`}
        <p class="flex flex-wrap items-center gap-2 text-sm">
          <span class="text-muted-foreground">{m.permalink}:</span>
          {#if entry.status === 'published' && path === entry.path}
            <a
              href={resolve(path as Path)}
              target="_blank"
              class="break-all underline">{address}</a
            >
          {:else}
            <span class="break-all">{address}</span>
          {/if}
          <Button
            variant="outline"
            size="sm"
            class="h-7"
            onclick={() => (editingSlug = true)}>{m.edit}</Button
          >
        </p>
      {:else}
        <div class="flex flex-wrap items-center gap-2 text-sm">
          <Label for="slug">{m.fieldSlug}</Label>
          <Input
            id="slug"
            class="h-8 max-w-xs"
            maxlength={191}
            placeholder={m.slugPlaceholder}
            bind:value={slug}
            aria-describedby={entry ? undefined : 'slug-help'}
            onkeydown={(event) => {
              if (event.key !== 'Enter' || !entry) return;
              event.preventDefault();
              editingSlug = false;
            }}
          />
          {#if entry}
            <Button
              variant="outline"
              size="sm"
              class="h-8"
              onclick={() => (editingSlug = false)}>{m.ok}</Button
            >
          {:else}
            <span id="slug-help" class="text-xs text-muted-foreground"
              >{m.permalinkAfterSave}</span
            >
          {/if}
        </div>
      {/if}
    </div>

    <div class="grid gap-2">
      <Label>{m.fieldBody}</Label>
      {#key editorKey}
        <Editor name="document" label={m.fieldBody} bind:value={body} />
      {/key}
      <p class="flex flex-wrap gap-x-4 text-xs text-muted-foreground">
        <span>{m.wordCount(words)}</span>
      </p>
    </div>

    <div class="grid gap-2">
      <Label for="excerpt">{m.fieldExcerpt}</Label>
      <Textarea
        id="excerpt"
        name="excerpt"
        maxlength={1000}
        rows={2}
        bind:value={excerpt}
        aria-describedby="excerpt-help"
      />
      <p id="excerpt-help" class="text-xs text-muted-foreground">
        {m.excerptHelp}
      </p>
    </div>

    {#if typeFields.length}
      <fieldset class="grid gap-4 rounded-md border p-4 sm:grid-cols-2">
        <legend class="px-1 text-sm font-medium">{m.customFields}</legend>
        {#each typeFields as field (field.key)}
          {@const id = `field-${field.key}`}
          {@const name = `field.${field.key}`}
          {@const value = fieldValue(field.key)}
          <div
            class="grid gap-2 {field.type === 'textarea'
              ? 'sm:col-span-2'
              : ''}"
          >
            {#if field.type === 'boolean'}
              <label class="flex items-center gap-2 text-sm">
                <input type="checkbox" {name} checked={value === true} />
                {field.label}
              </label>
            {:else}
              <Label for={id}>{field.label}{field.required ? ' *' : ''}</Label>
              {#if field.type === 'textarea'}
                <Textarea
                  {id}
                  {name}
                  rows={4}
                  maxlength={20000}
                  required={field.required}
                  value={typeof value === 'string' ? value : ''}
                />
              {:else if field.type === 'select'}
                <NativeSelect
                  class="w-full"
                  {id}
                  {name}
                  required={field.required}
                  value={typeof value === 'string' ? value : ''}
                >
                  <NativeSelectOption value="">{m.noChoice}</NativeSelectOption>
                  {#each field.options as option (option)}
                    <NativeSelectOption value={option}
                      >{option}</NativeSelectOption
                    >
                  {/each}
                </NativeSelect>
              {:else if field.type === 'image'}
                {@const chosen = imageFields[field.key]}
                <input type="hidden" {name} value={chosen?.id ?? ''} />
                {#if chosen?.url}
                  <img
                    src={chosen.url}
                    alt=""
                    class="aspect-video w-48 rounded-md border object-cover"
                  />
                {/if}
                <div class="flex gap-2">
                  <Button
                    {id}
                    variant="outline"
                    size="sm"
                    onclick={() => {
                      pickingField = field.key;
                      fieldPicker?.open();
                    }}>{m.mediaChoose}</Button
                  >
                  {#if chosen}
                    <Button
                      variant="ghost"
                      size="sm"
                      onclick={() => {
                        imageFields[field.key] = null;
                        touch();
                      }}>{m.mediaRemoveFeatured}</Button
                    >
                  {/if}
                </div>
              {:else}
                <Input
                  {id}
                  {name}
                  type={field.type === 'number'
                    ? 'number'
                    : field.type === 'date'
                      ? 'date'
                      : field.type === 'url'
                        ? 'url'
                        : 'text'}
                  step={field.type === 'number' ? 'any' : undefined}
                  required={field.required}
                  value={value === undefined || value === null
                    ? ''
                    : String(value)}
                />
              {/if}
            {/if}
            {#if field.help}<p class="text-xs text-muted-foreground">
                {field.help}
              </p>{/if}
          </div>
        {/each}
      </fieldset>
      <MediaPicker
        bind:this={fieldPicker}
        onpick={(media) => {
          imageFields[pickingField] = {
            id: media.id,
            url: thumbnailUrl(media),
          };
          touch();
        }}
      />
    {/if}

    <SeoEditor
      kind="content"
      initial={initial.seo}
      context={seo}
      source={{
        title,
        description: excerpt,
        slug: slug.trim() || (entry?.slug ?? ''),
        body: bodyText,
        path,
        pathHint: pattern,
        exclusion: seo.indexingEnabled ? null : m.indexingOff,
      }}
    />
  </div>

  <!-- Wide screens: the panel follows the page and scrolls on its own; the padding keeps card rings and focus rings inside the scroll box. -->
  <aside
    class="space-y-6 lg:sticky lg:top-4 lg:-m-1 lg:max-h-[calc(100dvh-2rem)] lg:self-start lg:overflow-y-auto lg:p-1"
  >
    <Card>
      <CardHeader><CardTitle>{m.publishTitle}</CardTitle></CardHeader>
      <CardContent class="space-y-4">
        <div class="flex flex-wrap gap-2">
          {#if !isLive}
            <Button
              type="submit"
              name="status"
              value={draftStatus}
              variant="outline"
              size="sm"
              disabled={saving}
              >{draftStatus === 'pending'
                ? m.saveAsPending
                : m.saveDraft}</Button
            >
          {/if}
          {#if entry}
            <Button
              variant="outline"
              size="sm"
              disabled={saving}
              onclick={preview}>{m.preview}</Button
            >
          {/if}
        </div>

        <div class="grid gap-2">
          {#if isLive && entry}
            <p class="flex flex-wrap items-center gap-2 text-sm">
              <span class="text-muted-foreground">{m.fieldStatus}:</span>
              {statusLabel(m, entry.status)}
              <Button
                type="submit"
                name="status"
                value="draft"
                variant="link"
                size="sm"
                class="h-auto p-0"
                disabled={saving}>{m.switchToDraft}</Button
              >
            </p>
          {:else}
            <Label for="status">{m.fieldStatus}</Label>
            <NativeSelect class="w-full" id="status" bind:value={draftStatus}>
              <NativeSelectOption value="draft"
                >{statusLabel(m, 'draft')}</NativeSelectOption
              >
              <NativeSelectOption value="pending"
                >{statusLabel(m, 'pending')}</NativeSelectOption
              >
            </NativeSelect>
          {/if}
        </div>

        {#if entry && revisionCount}
          <p class="flex flex-wrap items-center gap-2 text-sm">
            {m.revisionsCount(revisionCount)}
            <a
              class="underline"
              href={resolve('/admin/(app)/content/[id]/revisions', {
                id: entry.id,
              })}>{m.revisionsBrowse}</a
            >
          </p>
        {/if}

        <fieldset class="grid gap-2">
          <legend class="mb-1 text-sm font-medium">{m.visibility}</legend>
          {#each [{ key: 'public', label: m.visibilityPublic }, { key: 'password', label: m.visibilityPassword }, { key: 'private', label: m.visibilityPrivate }] as option (option.key)}
            <label class="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="visibility"
                value={option.key}
                bind:group={visibility}
                disabled={option.key === 'private' &&
                  !canPublish &&
                  entry?.status !== 'private'}
                class="size-4 accent-primary"
              />
              {option.label}
              {#if option.key === 'password' && entry?.protected}<Badge
                  variant="secondary">{m.protectedBadge}</Badge
                >{/if}
            </label>
          {/each}
          {#if visibility === 'password'}
            <Input
              id="content-password"
              name="password"
              type="password"
              autocomplete="new-password"
              maxlength={200}
              required={!entry?.protected}
              aria-label={m.fieldPassword}
              aria-describedby="content-password-help"
            />
            <p id="content-password-help" class="text-xs text-muted-foreground">
              {entry?.protected ? m.passwordSet : m.passwordHelp}
            </p>
          {:else if visibility === 'public' && entry?.protected}
            <input type="hidden" name="removePassword" value="on" />
          {/if}
          <!-- Kept in the form for other types, so changing the type never loses the setting. -->
          <label
            class="flex items-center gap-2 text-sm"
            hidden={contentType !== 'post'}
          >
            <input
              type="checkbox"
              name="sticky"
              checked={initial.sticky}
              class="size-4 accent-primary"
            />
            {m.fieldSticky}
          </label>
        </fieldset>

        {#if canPublish}
          <div class="grid gap-2">
            <Label for="publish-at">{m.fieldPublishAt}</Label>
            <Input
              id="publish-at"
              type="datetime-local"
              bind:value={publishAt}
              aria-describedby="publish-at-help"
            />
            <input type="hidden" name="publishedAt" value={publishedAt} />
            <p id="publish-at-help" class="text-xs text-muted-foreground">
              {m.publishAtHelp}
            </p>
          </div>
        {/if}

        <div class="grid gap-2">
          <Label for="type">{m.fieldType}</Label>
          <NativeSelect
            class="w-full"
            id="type"
            name="type"
            bind:value={contentType}
          >
            {#each model.types as option (option.key)}
              <NativeSelectOption value={option.key}
                >{option.builtin
                  ? typeLabel(m, option.key)
                  : option.name}</NativeSelectOption
              >
            {/each}
          </NativeSelect>
        </div>

        {#if authors}
          <div class="grid gap-2">
            <Label for="author">{m.fieldAuthor}</Label>
            <NativeSelect
              class="w-full"
              id="author"
              name="authorId"
              value={initial.authorId}
            >
              {#each authors as author (author.id)}
                <NativeSelectOption value={author.id}
                  >{author.name}</NativeSelectOption
                >
              {/each}
            </NativeSelect>
          </div>
        {/if}

        <!-- Kept in the form when hidden, so changing the type never loses the setting. -->
        <label
          class="flex items-center gap-2 text-sm"
          hidden={!supports.comments}
        >
          <input
            type="checkbox"
            name="allowComments"
            checked={initial.allowComments}
            class="size-4 accent-primary"
          />
          {m.fieldAllowComments}
        </label>

        <div class="space-y-2 border-t pt-4">
          {@render saveButtons(false)}
          <FormMessage form={saveFailure} />
          <p class="text-xs text-muted-foreground">{m.saveShortcut}</p>
        </div>
      </CardContent>
    </Card>

    <Card hidden={!supports.featuredImage}>
      <CardHeader><CardTitle>{m.featuredImage}</CardTitle></CardHeader>
      <CardContent class="grid gap-2">
        <input
          type="hidden"
          name="featuredMediaId"
          value={featured?.id ?? ''}
        />
        {#if featured?.url}
          <img
            src={featured.url}
            alt={featured.alt}
            class="aspect-video w-full rounded-md border object-cover"
          />
        {:else if !featured}
          <p class="text-sm text-muted-foreground">{m.featuredNone}</p>
        {/if}
        <div class="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onclick={() => featuredPicker.open()}>{m.mediaChoose}</Button
          >
          {#if featured}
            <Button
              variant="ghost"
              size="sm"
              onclick={() => {
                featured = null;
                touch();
              }}>{m.mediaRemoveFeatured}</Button
            >
          {/if}
        </div>
        <MediaPicker
          bind:this={featuredPicker}
          onpick={(media, choice) => {
            featured = {
              id: media.id,
              url:
                media.variants.find((variant) => variant.name === 'medium')
                  ?.url ?? media.url,
              alt: choice.alt,
            };
            touch();
          }}
        />
      </CardContent>
    </Card>

    {#if supports.categories}
      <Card>
        <CardHeader><CardTitle>{m.columnCategories}</CardTitle></CardHeader>
        <CardContent class="grid gap-3">
          <fieldset>
            <legend class="sr-only">{m.columnCategories}</legend>
            {#if categoryRows.length}
              <div
                class="max-h-48 space-y-1 overflow-y-auto rounded-md border bg-background p-3"
              >
                {#each categoryRows as { term, depth } (term.id)}
                  <label
                    class="flex items-center gap-2 text-sm"
                    style:padding-left="{depth * 1.25}rem"
                  >
                    <input
                      type="checkbox"
                      name="categoryIds"
                      value={term.id}
                      checked={initial.categoryIds.has(term.id) ||
                        addedCategories.has(term.id)}
                      class="size-4 accent-primary"
                    />
                    {term.name}
                  </label>
                {/each}
              </div>
            {:else}
              <p class="text-sm text-muted-foreground">{m.noCategories}</p>
            {/if}
          </fieldset>
          {#if canManageTerms}
            {#if addingCategory}
              <div class="grid gap-2">
                <Input
                  aria-label={m.newCategoryName}
                  placeholder={m.newCategoryName}
                  maxlength={191}
                  bind:value={categoryName}
                  onkeydown={(event) => {
                    if (event.key !== 'Enter') return;
                    event.preventDefault();
                    void addCategory();
                  }}
                />
                <NativeSelect
                  class="w-full"
                  aria-label={m.parentCategory}
                  bind:value={categoryParent}
                >
                  <NativeSelectOption value=""
                    >— {m.parentCategory} —</NativeSelectOption
                  >
                  {#each categoryRows as { term, depth } (term.id)}
                    <NativeSelectOption value={term.id}
                      >{' '.repeat(depth * 3)}{term.name}</NativeSelectOption
                    >
                  {/each}
                </NativeSelect>
                <Button variant="outline" size="sm" onclick={addCategory}
                  >{m.addNewCategory}</Button
                >
                {#if categoryError}<p
                    class="text-sm text-destructive"
                    role="alert"
                  >
                    {categoryError}
                  </p>{/if}
              </div>
            {:else}
              <Button
                variant="link"
                size="sm"
                class="h-auto justify-start p-0"
                onclick={() => (addingCategory = true)}
                >+ {m.addNewCategory}</Button
              >
            {/if}
          {/if}
        </CardContent>
      </Card>
    {/if}

    {#if supports.tags}
      <Card>
        <CardHeader><CardTitle>{m.columnTags}</CardTitle></CardHeader>
        <CardContent class="grid gap-3">
          {#each chosenTags as tag (tag.id)}
            <input type="hidden" name="tagIds" value={tag.id} />
          {/each}
          <div class="flex gap-2">
            <Input
              aria-label={m.tagInput}
              aria-describedby="tag-help"
              list="tag-names"
              maxlength={500}
              bind:value={tagText}
              onkeydown={(event) => {
                if (event.key !== 'Enter' && event.key !== ',') return;
                event.preventDefault();
                void addTags();
              }}
            />
            <Button variant="outline" size="sm" class="h-9" onclick={addTags}
              >{m.add}</Button
            >
          </div>
          <datalist id="tag-names">
            {#each tagList as tag (tag.id)}<option value={tag.name}
              ></option>{/each}
          </datalist>
          <p id="tag-help" class="text-xs text-muted-foreground">
            {m.tagInputHelp}
          </p>
          {#if tagError}<p class="text-sm text-destructive" role="alert">
              {tagError}
            </p>{/if}
          {#if chosenTags.length}
            <ul class="flex flex-wrap gap-2">
              {#each chosenTags as tag (tag.id)}
                <li>
                  <Badge variant="secondary" class="gap-1 pr-1">
                    {tag.name}
                    <button
                      type="button"
                      class="rounded-full p-0.5 hover:bg-muted"
                      aria-label={m.removeTag(tag.name)}
                      onclick={() => {
                        chosenTags = chosenTags.filter(
                          (option) => option.id !== tag.id,
                        );
                        touch();
                      }}><X class="size-3" /></button
                    >
                  </Badge>
                </li>
              {/each}
            </ul>
          {:else}
            <p class="text-sm text-muted-foreground">{m.noTags}</p>
          {/if}
        </CardContent>
      </Card>
    {/if}

    {#if contentType === 'page'}
      <Card
        ><CardHeader><CardTitle>{m.parentPage}</CardTitle></CardHeader
        ><CardContent>
          <NativeSelect
            class="w-full"
            name="parentId"
            aria-label={m.parentPage}
            value={initial.parentId}
          >
            <NativeSelectOption value="">{m.none}</NativeSelectOption>
            {#each parentPages.filter((parent) => parent.id !== entry?.id) as parent (parent.id)}
              <NativeSelectOption value={parent.id}
                >{parent.title}</NativeSelectOption
              >
            {/each}
          </NativeSelect>
          <Label for="menu-order">{m.privacyMenuOrder}</Label>
          <Input
            id="menu-order"
            name="menuOrder"
            type="number"
            min={-100000}
            max={100000}
            value={initial.menuOrder}
          />
        </CardContent></Card
      >
    {/if}
    {#each extraTaxonomies as taxonomy (taxonomy.key)}
      <Card
        ><CardHeader><CardTitle>{taxonomy.name}</CardTitle></CardHeader
        ><CardContent class="space-y-2">
          {#each flattenTree(taxonomy.terms) as { term, depth } (term.id)}
            <label
              class="flex items-center gap-2 text-sm"
              style:padding-left={`${depth}rem`}
            >
              <input
                type="checkbox"
                name="extraTermIds"
                value={term.id}
                checked={initial.extraTermIds.has(term.id)}
              />{term.name}
            </label>
          {/each}
        </CardContent></Card
      >
    {/each}
  </aside>

  <!-- Mobile: the save buttons stay reachable while writing. -->
  <div
    bind:this={saveBar}
    class="fixed inset-x-0 bottom-0 z-20 flex items-center justify-end gap-2 border-t bg-background p-3 lg:hidden"
  >
    {@render saveButtons(true)}
  </div>
</form>

{#if entry}
  <!-- Not enhanced: the browser follows the redirect into the preview tab. It sends no text:
       `preview()` has already stored the current text as the autosave the preview shows. -->
  <form
    bind:this={previewForm}
    method="POST"
    action="?/preview"
    target="_blank"
    hidden
  ></form>
{/if}

<dialog
  bind:this={expiredDialog}
  class="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-lg border bg-background p-6 text-foreground shadow-lg backdrop:bg-black/40"
  aria-labelledby="session-expired-title"
>
  <h2 id="session-expired-title" class="text-lg font-semibold">
    {m.sessionExpiredTitle}
  </h2>
  <p class="mt-2 text-sm text-muted-foreground">{m.sessionExpiredHelp}</p>
  <div class="mt-4 flex justify-end gap-2">
    <Button variant="ghost" onclick={() => expiredDialog.close()}
      >{m.close}</Button
    >
    <Button
      href={resolve(
        `${loginPath}?${new URLSearchParams({ redirect_to: `${page.url.pathname}${page.url.search}` })}` as Path,
      )}
      target="_blank"
      onclick={() => expiredDialog.close()}>{m.signInAgain}</Button
    >
  </div>
</dialog>
