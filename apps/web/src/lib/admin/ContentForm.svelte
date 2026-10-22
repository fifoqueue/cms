<script lang="ts">
  import { enhance } from '$app/forms';
  import {
    CONTENT_STATUSES,
    DEFAULT_ENTRY_SEO,
    UNPUBLISHED_STATUSES,
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
  import { onDestroy, untrack } from 'svelte';
  import type { ContentFormValues } from '#lib/admin/content-form-values.js';
  import Editor from '#lib/admin/Editor.svelte';
  import MediaPicker from '#lib/admin/MediaPicker.svelte';
  import SeoEditor from '#lib/admin/SeoEditor.svelte';
  import type { SeoPreviewContext } from '#lib/admin/seo.js';
  import { documentText, seoFormValues } from '#lib/admin/seo.js';
  import { flattenTree } from '#lib/admin/taxonomy-tree.js';
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
    /** Author of a new entry: the signed-in user. */
    defaultAuthorId?: string;
    submitLabel: string;
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
    defaultAuthorId = '',
    submitLabel,
  }: Props = $props();

  const i18n = useI18n();
  const m = $derived(i18n.m);

  const EMPTY: ContentDocument = {
    type: 'doc',
    content: [{ type: 'paragraph' }],
  };
  /** `datetime-local` value in the browser's zone for an ISO time. */
  const localTime = (iso: string | null | undefined) => {
    if (!iso) return '';
    const date = new Date(iso);
    return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
      .toISOString()
      .slice(0, 16);
  };

  // Initial values only; the form owns the state afterwards.
  const initial = untrack(() => ({
    type: values?.type ?? entry?.type ?? type,
    title: values?.title ?? draft?.title ?? entry?.title ?? '',
    slug: values?.slug ?? entry?.slug ?? '',
    excerpt: values?.excerpt ?? draft?.excerpt ?? entry?.excerpt ?? '',
    status: (values?.status ?? entry?.status ?? 'draft') as ContentStatus,
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
      values?.categoryIds ?? entry?.categories.map(({ id }) => id) ?? [],
    ),
    tagIds: new Set(values?.tagIds ?? entry?.tags.map(({ id }) => id) ?? []),
    seo: values?.seo ?? seoFormValues(entry?.seo ?? DEFAULT_ENTRY_SEO),
    fields: values?.fields ?? entry?.fields ?? {},
  }));
  let body = $state(initial.document);
  // Live fields the SEO previews and autosave follow.
  let title = $state(initial.title);
  let slug = $state(initial.slug);
  let excerpt = $state(initial.excerpt);
  let contentType = $state(initial.type);
  let status = $state(initial.status);
  let publishAt = $state(initial.publishedAt);
  let featured = $state(
    untrack(() =>
      values
        ? values.featuredMediaId
          ? { id: values.featuredMediaId, url: '', alt: '' }
          : null
        : entry?.featuredImage && entry.featuredMediaId
          ? {
              id: entry.featuredMediaId,
              url: entry.featuredImage.sizes[0]?.url ?? entry.featuredImage.url,
              alt: entry.featuredImage.alt,
            }
          : null,
    ),
  );
  let featuredPicker: ReturnType<typeof MediaPicker>;

  /** Statuses this user may choose; the current one stays listed so saving keeps it. */
  const statuses = $derived(
    CONTENT_STATUSES.filter(
      (option) =>
        canPublish ||
        UNPUBLISHED_STATUSES.includes(option) ||
        option === initial.status,
    ),
  );
  const publishedAt = $derived(
    publishAt ? new Date(publishAt).toISOString() : '',
  );

  const bodyText = $derived(documentText(body).text);
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
            return [field.key, typeof id === 'string' ? { id, url: '' } : null];
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
          id: entry.id,
          slug: slug.trim() || entry.slug,
          title: title.trim() || entry.title,
          publishedAt: entry.publishedAt,
          createdAt: entry.createdAt,
        })
      : null,
  );

  const categoryRows = $derived(flattenTree(categories));
  const tagRows = $derived(
    [...tags].sort((a, b) => a.name.localeCompare(b.name)),
  );

  // Autosave: every 30 seconds while the text differs from what was last kept.
  let autosaveState = $state<{ ok: boolean; at: Date } | null>(null);
  let kept = untrack(() => JSON.stringify([title, excerpt, body]));
  const timer = setInterval(async () => {
    if (!entry) return;
    const current = JSON.stringify([title, excerpt, body]);
    if (current === kept) return;
    const response = await fetch(`/admin/content/${entry.id}/autosave`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title, excerpt, document: body }),
    }).catch(() => null);
    autosaveState = { ok: !!response?.ok, at: new Date() };
    if (response?.ok) kept = current;
  }, 30_000);
  onDestroy(() => clearInterval(timer));
</script>

{#snippet termChoices(
  name: string,
  legend: string,
  rows: { term: TermOption; depth: number }[],
  selected: Set<string>,
  empty: string,
)}
  <fieldset class="grid gap-2">
    <legend class="mb-2 text-sm font-medium">{legend}</legend>
    {#if rows.length}
      <div
        class="max-h-48 space-y-1 overflow-y-auto rounded-md border bg-background p-3"
      >
        {#each rows as { term, depth } (term.id)}
          <label
            class="flex items-center gap-2 text-sm"
            style:padding-left="{depth * 1.25}rem"
          >
            <input
              type="checkbox"
              {name}
              value={term.id}
              checked={selected.has(term.id)}
              class="size-4 accent-primary"
            />
            {term.name}
          </label>
        {/each}
      </div>
    {:else}
      <p class="text-sm text-muted-foreground">{empty}</p>
    {/if}
  </fieldset>
{/snippet}

<form
  method="POST"
  action="?/save"
  use:enhance={() =>
    ({ update }) =>
      update({ reset: false })}
  class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]"
>
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
    </div>

    <div class="grid gap-4 sm:grid-cols-2">
      <div class="grid gap-2">
        <Label for="slug">{m.fieldSlug}</Label>
        <Input
          id="slug"
          name="slug"
          maxlength={191}
          placeholder={m.slugPlaceholder}
          bind:value={slug}
        />
      </div>
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
    </div>

    <div class="grid gap-2">
      <Label>{m.fieldBody}</Label>
      <Editor name="document" bind:value={body} />
      {#if autosaveState}
        <p class="text-xs text-muted-foreground" role="status">
          {autosaveState.ok
            ? m.autosaveSaved(
                autosaveState.at.toLocaleTimeString(i18n.language),
              )
            : m.autosaveFailed}
        </p>
      {/if}
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
                    type="button"
                    variant="outline"
                    size="sm"
                    onclick={() => {
                      pickingField = field.key;
                      fieldPicker?.open();
                    }}>{m.mediaChoose}</Button
                  >
                  {#if chosen}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onclick={() => (imageFields[field.key] = null)}
                      >{m.mediaRemoveFeatured}</Button
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
        onpick={(media) =>
          (imageFields[pickingField] = {
            id: media.id,
            url:
              media.variants.find((variant) => variant.name === 'thumbnail')
                ?.url ?? media.url,
          })}
      />
    {/if}

    <div class="grid gap-6 sm:grid-cols-2">
      {#if supports.categories}
        {@render termChoices(
          'categoryIds',
          m.columnCategories,
          categoryRows,
          initial.categoryIds,
          m.noCategories,
        )}
      {/if}
      {#if supports.tags}
        {@render termChoices(
          'tagIds',
          m.columnTags,
          tagRows.map((term) => ({ term, depth: 0 })),
          initial.tagIds,
          m.noTags,
        )}
      {/if}
    </div>

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

  <aside class="space-y-6">
    <Card>
      <CardHeader><CardTitle>{m.publishTitle}</CardTitle></CardHeader>
      <CardContent class="space-y-4">
        <div class="grid gap-2">
          <Label for="status">{m.fieldStatus}</Label>
          <NativeSelect
            class="w-full"
            id="status"
            name="status"
            bind:value={status}
          >
            {#each statuses as option (option)}
              <NativeSelectOption value={option}
                >{statusLabel(m, option)}</NativeSelectOption
              >
            {/each}
          </NativeSelect>
        </div>

        {#if canPublish}
          <div class="grid gap-2">
            <Label for="publish-at">{m.fieldPublishAt}</Label>
            <Input
              id="publish-at"
              type="datetime-local"
              bind:value={publishAt}
              required={status === 'scheduled'}
              aria-describedby="publish-at-help"
            />
            <input type="hidden" name="publishedAt" value={publishedAt} />
            <p id="publish-at-help" class="text-xs text-muted-foreground">
              {m.publishAtHelp}
            </p>
          </div>
        {/if}

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

        <div class="grid gap-2" hidden={!supports.featuredImage}>
          <Label>{m.featuredImage}</Label>
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
              type="button"
              variant="outline"
              size="sm"
              onclick={() => featuredPicker.open()}>{m.mediaChoose}</Button
            >
            {#if featured}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onclick={() => (featured = null)}
                >{m.mediaRemoveFeatured}</Button
              >
            {/if}
          </div>
          <MediaPicker
            bind:this={featuredPicker}
            onpick={(media) =>
              (featured = {
                id: media.id,
                url:
                  media.variants.find((variant) => variant.name === 'medium')
                    ?.url ?? media.url,
                alt: media.alt,
              })}
          />
        </div>

        <label class="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="sticky"
            checked={initial.sticky}
            class="size-4 accent-primary"
          />
          {m.fieldSticky}
        </label>

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

        <div class="grid gap-2">
          <Label for="content-password" class="flex items-center gap-2">
            {m.fieldPassword}
            {#if entry?.protected}<Badge variant="secondary"
                >{m.protectedBadge}</Badge
              >{/if}
          </Label>
          <Input
            id="content-password"
            name="password"
            type="password"
            autocomplete="new-password"
            maxlength={200}
            aria-describedby="content-password-help"
          />
          <p id="content-password-help" class="text-xs text-muted-foreground">
            {entry?.protected ? m.passwordSet : m.passwordHelp}
          </p>
          {#if entry?.protected}
            <label class="flex items-center gap-2 text-sm">
              <input type="checkbox" name="removePassword" />
              {m.passwordRemove}
            </label>
          {/if}
        </div>

        <Button type="submit" class="w-full">{submitLabel}</Button>
      </CardContent>
    </Card>
  </aside>
  {#if contentType === 'page'}
    <Card
      ><CardHeader><CardTitle>{m.parentPage}</CardTitle></CardHeader
      ><CardContent>
        <NativeSelect
          name="parentId"
          aria-label={m.parentPage}
          value={values?.parentId ?? entry?.parentId ?? ''}
        >
          <NativeSelectOption value="">{m.none}</NativeSelectOption>
          {#each parentPages.filter((parent) => parent.id !== entry?.id) as parent (parent.id)}
            <NativeSelectOption value={parent.id}
              >{parent.title}</NativeSelectOption
            >
          {/each}
        </NativeSelect>
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
              checked={(
                values?.extraTermIds ??
                entry?.extraTerms.map((term) => term.id) ??
                []
              ).includes(term.id)}
            />{term.name}
          </label>
        {/each}
      </CardContent></Card
    >
  {/each}
</form>
