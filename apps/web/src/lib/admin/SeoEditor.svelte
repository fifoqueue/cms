<script lang="ts">
  import { formatSeoTitle } from '@cms/sdk';
  import { default as ChevronDown } from '@lucide/svelte/icons/chevron-down';
  import { default as CircleAlert } from '@lucide/svelte/icons/circle-alert';
  import { default as CircleCheck } from '@lucide/svelte/icons/circle-check';
  import { default as CircleDashed } from '@lucide/svelte/icons/circle-dashed';
  import { Input } from '#lib/components/ui/input/index.js';
  import { Label } from '#lib/components/ui/label/index.js';
  import {
    NativeSelect,
    NativeSelectOption,
  } from '#lib/components/ui/native-select/index.js';
  import { Switch } from '#lib/components/ui/switch/index.js';
  import { Textarea } from '#lib/components/ui/textarea/index.js';
  import { useI18n } from '#lib/i18n/index.js';
  import type {
    LengthState,
    SeoFormValues,
    SeoPreviewContext,
  } from '#lib/admin/seo.js';
  import {
    LENGTH_GUIDE,
    SCHEMA_TYPES,
    SEO_FIELDSET,
    absoluteUrl,
    charCount,
    keywordSlug,
    lengthState,
    occurrences,
    readingStats,
    seoField,
  } from '#lib/admin/seo.js';
  import { untrack } from 'svelte';

  interface Source {
    /** The title the site uses without a custom SEO title. */
    title: string;
    /** Excerpt (else the automatic summary) or term description: the fallback meta description. */
    description: string;
    slug: string;
    /** Plain body text the keyword checks and reading facts look at. */
    body: string;
    /** Public path, or `null` while the site assigns it on save. */
    path: string | null;
    /** Shown instead of a path while `path` is `null`. */
    pathHint: string;
    /** Why the site asks search engines not to index this page regardless of its own setting. */
    exclusion: string | null;
  }

  interface Props {
    /** Terms share the fieldset but have no schema type or byline. */
    kind: 'content' | 'term';
    initial: SeoFormValues;
    context: SeoPreviewContext;
    source: Source;
  }

  let { kind, initial, context, source }: Props = $props();

  const i18n = useI18n();
  const m = $derived(i18n.m);

  // Initial values only; the fieldset owns the state afterwards.
  let seo = $state(untrack(() => ({ ...initial })));

  const id = (key: string) => `seo-${key}`;

  /** Yoast-style tabs; every field stays in the form, hidden tabs are only not shown. */
  const TABS = ['search', 'social', 'advanced'] as const;
  let tab = $state<(typeof TABS)[number]>('search');
  const tabLabel = $derived({
    search: m.seoTabSearch,
    social: m.seoTabSocial,
    advanced: m.seoTabAdvanced,
  });
  const BAR = {
    empty: 'w-0',
    short: 'bg-amber-500',
    good: 'bg-emerald-500',
    long: 'bg-red-500',
  } as const;
  /** Share of the recommended maximum, for the length bar. */
  const fill = (count: number, max: number) =>
    `${Math.min(100, Math.round((count / max) * 100))}%`;

  const renderedTitle = $derived(
    formatSeoTitle(
      seo.title.trim() || source.title.trim() || m.seoUntitled,
      context.siteTitle,
      context.titleTemplate,
    ),
  );
  const description = $derived(
    seo.description.trim() ||
      source.description.trim() ||
      context.siteDescription,
  );
  const url = $derived(
    seo.canonicalUrl.trim() ||
      absoluteUrl(context.siteUrl, source.path ?? source.pathHint),
  );
  const socialTitle = $derived(
    seo.socialTitle.trim() || seo.title.trim() || source.title.trim(),
  );
  const socialDescription = $derived(
    seo.socialDescription.trim() || description,
  );
  const image = $derived(
    seo.imageUrl.trim()
      ? { url: seo.imageUrl.trim(), alt: seo.imageAlt.trim(), fallback: false }
      : context.defaultImageUrl
        ? {
            url: context.defaultImageUrl,
            alt: context.defaultImageAlt,
            fallback: true,
          }
        : null,
  );
  const host = $derived(context.siteUrl ? new URL(context.siteUrl).host : '');
  /** The address as Google prints it: host › path › segments. */
  const crumbs = $derived(
    url
      .replace(/^https?:\/\/[^/]+/, '')
      .split('/')
      .filter(Boolean)
      .map((part) => {
        try {
          return decodeURIComponent(part);
        } catch {
          return part;
        }
      }),
  );

  const titleState = $derived(lengthState(renderedTitle, LENGTH_GUIDE.title));
  const descriptionState = $derived(
    lengthState(description, LENGTH_GUIDE.description),
  );

  const STATE_TEXT: Record<LengthState, string> = $derived({
    empty: m.seoLengthEmpty,
    short: m.seoLengthShort,
    good: m.seoLengthGood,
    long: m.seoLengthLong,
  });

  const stats = $derived(readingStats(source.body));

  interface Check {
    label: string;
    done: boolean | null;
    detail?: string;
  }

  const keyword = $derived(seo.focusKeyword.trim());
  const checks = $derived.by((): Check[] => {
    if (!keyword) return [];
    const slugWords = keywordSlug(keyword);
    const inBody = occurrences(source.body, keyword);
    return [
      {
        label: m.seoInSearchTitle,
        done: occurrences(renderedTitle, keyword) > 0,
      },
      {
        label: m.seoInMetaDescription,
        done: occurrences(description, keyword) > 0,
        detail: description ? undefined : m.seoNoDescriptionYet,
      },
      {
        label: kind === 'content' ? m.seoInBody : m.seoInDescription,
        done: inBody > 0,
        detail: m.seoTimes(inBody),
      },
      {
        label: m.seoInSlug,
        done: slugWords ? source.slug.includes(slugWords) : null,
        detail: slugWords
          ? source.slug
            ? undefined
            : m.seoSlugOnSave
          : m.seoSlugNotComparable,
      },
    ];
  });
</script>

{#snippet lengthBar(count: number, state: LengthState, max: number)}
  <div class="flex items-center gap-3">
    <div class="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
      <div
        class="h-full rounded-full transition-all {BAR[state]}"
        style:width={fill(count, max)}
      ></div>
    </div>
    <span
      class="shrink-0 text-xs text-muted-foreground tabular-nums"
      title={STATE_TEXT[state]}>{count} / {max}</span
    >
  </div>
{/snippet}

<details
  open
  class="group/seo rounded-lg border bg-card text-card-foreground shadow-xs"
>
  <summary
    class="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden"
  >
    <span class="flex items-center gap-2 font-semibold">
      SEO
      {#if keyword}
        <span
          class="rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground"
          >{keyword}</span
        >
      {/if}
    </span>
    <ChevronDown
      class="size-4 text-muted-foreground transition group-open/seo:rotate-180"
    />
  </summary>
  <input type="hidden" name={SEO_FIELDSET} value="1" />

  <div class="border-t">
    <div role="tablist" aria-label={m.seoTabs} class="flex gap-1 border-b px-3">
      {#each TABS as key (key)}
        <button
          type="button"
          role="tab"
          id={id(`tab-${key}`)}
          aria-selected={tab === key}
          aria-controls={id(`panel-${key}`)}
          class="-mb-px border-b-2 border-transparent px-3 py-2.5 text-sm text-muted-foreground hover:text-foreground aria-selected:border-primary aria-selected:font-medium aria-selected:text-foreground"
          onclick={() => (tab = key)}>{tabLabel[key]}</button
        >
      {/each}
    </div>

    <!-- Search: Google preview, title, description, keyphrase (Yoast's main tab). -->
    <div
      role="tabpanel"
      id={id('panel-search')}
      aria-labelledby={id('tab-search')}
      hidden={tab !== 'search'}
      class="space-y-5 p-4"
    >
      <section class="space-y-2" aria-labelledby={id('search-preview')}>
        <h3 id={id('search-preview')} class="text-sm font-medium">
          {m.seoSearchPreview}
        </h3>
        <div
          class="max-w-[600px] rounded-lg border bg-white p-4 text-left dark:bg-white"
        >
          <div class="flex items-center gap-2">
            <span
              class="flex size-7 shrink-0 items-center justify-center rounded-full bg-[#f1f3f4] text-xs font-semibold text-[#5f6368]"
              >{(context.siteTitle || 'S').slice(0, 1)}</span
            >
            <div class="min-w-0 leading-tight">
              <p class="truncate text-sm text-[#202124]">
                {context.siteTitle}
              </p>
              <p class="truncate text-xs text-[#4d5156]">
                {[host, ...crumbs].filter(Boolean).join(' › ') ||
                  source.pathHint}
              </p>
            </div>
          </div>
          <p
            class="mt-2 line-clamp-1 text-xl leading-snug text-[#1a0dab] hover:underline"
          >
            {renderedTitle}
          </p>
          <p class="mt-1 line-clamp-2 text-sm leading-relaxed text-[#4d5156]">
            {description || m.seoNoDescription}
          </p>
        </div>
        {#if seo.noIndex || source.exclusion}
          <p
            class="flex items-start gap-1.5 text-sm text-amber-700 dark:text-amber-400"
          >
            <CircleAlert class="mt-0.5 size-4 shrink-0" />
            {seo.noIndex ? m.seoPageNoIndex : source.exclusion}
          </p>
        {/if}
      </section>

      <div class="grid gap-2">
        <Label for={id('title')}>{m.seoTitle}</Label>
        <Input
          id={id('title')}
          name={seoField('title')}
          maxlength={200}
          placeholder={source.title || m.seoUsesTitle}
          bind:value={seo.title}
        />
        {@render lengthBar(
          charCount(renderedTitle),
          titleState,
          LENGTH_GUIDE.title.max,
        )}
      </div>
      <div class="grid gap-2">
        <Label for={id('description')}>{m.seoMetaDescription}</Label>
        <Textarea
          id={id('description')}
          name={seoField('description')}
          maxlength={500}
          rows={3}
          placeholder={source.description ||
            context.siteDescription ||
            (kind === 'content' ? m.seoUsesExcerpt : m.seoUsesDescription)}
          bind:value={seo.description}
        />
        {@render lengthBar(
          charCount(description),
          descriptionState,
          LENGTH_GUIDE.description.max,
        )}
      </div>

      <div class="grid gap-2">
        <Label for={id('focusKeyword')}>{m.seoFocusKeyword}</Label>
        <Input
          id={id('focusKeyword')}
          name={seoField('focusKeyword')}
          maxlength={100}
          bind:value={seo.focusKeyword}
        />
        <p class="text-xs text-muted-foreground">{m.seoFocusKeywordHelp}</p>
        {#if checks.length}
          <ul class="mt-1 space-y-1.5 text-sm">
            {#each checks as check (check.label)}
              <li class="flex items-start gap-2">
                {#if check.done === null}
                  <CircleDashed
                    class="mt-0.5 size-4 shrink-0 text-muted-foreground"
                  />
                {:else if check.done}
                  <CircleCheck
                    class="mt-0.5 size-4 shrink-0 text-emerald-600"
                  />
                {:else}
                  <CircleAlert class="mt-0.5 size-4 shrink-0 text-amber-600" />
                {/if}
                <span>
                  {check.done === false
                    ? m.seoCheckMissing(check.label)
                    : check.label}
                  {#if check.detail}<span class="text-muted-foreground">
                      · {check.detail}</span
                    >{/if}
                </span>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
      {#if kind === 'content'}
        <p class="text-xs text-muted-foreground">
          {m.seoReadingStats(
            stats.words,
            stats.minutes,
            stats.wordsPerSentence,
          )}
        </p>
      {/if}
    </div>

    <!-- Social: how a shared link looks. -->
    <div
      role="tabpanel"
      id={id('panel-social')}
      aria-labelledby={id('tab-social')}
      hidden={tab !== 'social'}
      class="space-y-5 p-4"
    >
      <div class="max-w-[500px] overflow-hidden rounded-lg border">
        {#if image}
          <img
            src={image.url}
            alt={image.alt}
            class="aspect-[1.91/1] w-full bg-muted object-cover"
          />
        {:else}
          <div
            class="flex aspect-[1.91/1] items-center justify-center bg-muted text-sm text-muted-foreground"
          >
            {m.seoNoImage}
          </div>
        {/if}
        <div class="space-y-1 border-t bg-muted/40 p-3">
          {#if host}<p class="text-xs text-muted-foreground uppercase">
              {host}
            </p>{/if}
          <p class="line-clamp-1 font-medium">{socialTitle || m.seoUntitled}</p>
          <p class="line-clamp-2 text-sm text-muted-foreground">
            {socialDescription}
          </p>
        </div>
      </div>
      {#if image?.fallback}
        <p class="text-xs text-muted-foreground">{m.seoUsingDefaultImage}</p>
      {/if}
      <div class="grid gap-2">
        <Label for={id('socialTitle')}>{m.seoSocialTitle}</Label>
        <Input
          id={id('socialTitle')}
          name={seoField('socialTitle')}
          maxlength={200}
          placeholder={seo.title || source.title || m.seoUsesSeoTitle}
          bind:value={seo.socialTitle}
        />
      </div>
      <div class="grid gap-2">
        <Label for={id('socialDescription')}>{m.seoSocialDescription}</Label>
        <Textarea
          id={id('socialDescription')}
          name={seoField('socialDescription')}
          maxlength={500}
          rows={2}
          placeholder={description || m.seoUsesMetaDescription}
          bind:value={seo.socialDescription}
        />
      </div>
      <div class="grid gap-4 sm:grid-cols-2">
        <div class="grid gap-2">
          <Label for={id('imageUrl')}>{m.seoImageUrl}</Label>
          <Input
            id={id('imageUrl')}
            name={seoField('imageUrl')}
            type="url"
            maxlength={2048}
            placeholder={context.defaultImageUrl || 'https://…'}
            bind:value={seo.imageUrl}
          />
        </div>
        <div class="grid gap-2">
          <Label for={id('imageAlt')}>{m.seoImageAlt}</Label>
          <Input
            id={id('imageAlt')}
            name={seoField('imageAlt')}
            maxlength={500}
            bind:value={seo.imageAlt}
          />
        </div>
      </div>
      {#if seo.imageUrl.trim() && !seo.imageAlt.trim()}
        <p class="text-xs text-amber-700 dark:text-amber-400">
          {m.seoImageAltMissing}
        </p>
      {/if}
    </div>

    <!-- Advanced: robots, canonical and structured data (Yoast's "Advanced"). -->
    <div
      role="tabpanel"
      id={id('panel-advanced')}
      aria-labelledby={id('tab-advanced')}
      hidden={tab !== 'advanced'}
      class="space-y-5 p-4"
    >
      <div class="space-y-3">
        <div class="flex items-center gap-3">
          <Switch
            id={id('noIndex')}
            name={seoField('noIndex')}
            bind:checked={seo.noIndex}
          />
          <Label for={id('noIndex')}>{m.seoNoIndex}</Label>
        </div>
        <div class="flex items-center gap-3">
          <Switch
            id={id('noFollow')}
            name={seoField('noFollow')}
            bind:checked={seo.noFollow}
          />
          <Label for={id('noFollow')}>{m.seoNoFollow}</Label>
        </div>
      </div>
      <div class="grid gap-2">
        <Label for={id('canonicalUrl')}>{m.seoCanonicalUrl}</Label>
        <Input
          id={id('canonicalUrl')}
          name={seoField('canonicalUrl')}
          type="url"
          maxlength={2048}
          placeholder={source.path && context.siteUrl
            ? absoluteUrl(context.siteUrl, source.path)
            : 'https://example.com/original-page'}
          bind:value={seo.canonicalUrl}
        />
        <p class="text-xs text-muted-foreground">{m.seoCanonicalUrlHelp}</p>
      </div>
      {#if kind === 'content'}
        <div class="grid gap-4 sm:grid-cols-3">
          <div class="grid gap-2">
            <Label for={id('schemaType')}>{m.seoSchemaType}</Label>
            <NativeSelect
              id={id('schemaType')}
              name={seoField('schemaType')}
              class="w-full"
              bind:value={seo.schemaType}
            >
              {#each SCHEMA_TYPES as option (option)}
                <NativeSelectOption value={option}
                  >{option === 'auto'
                    ? m.seoSchemaAuto
                    : option}</NativeSelectOption
                >
              {/each}
            </NativeSelect>
          </div>
          <div class="grid gap-2">
            <Label for={id('authorName')}>{m.seoAuthorName}</Label>
            <Input
              id={id('authorName')}
              name={seoField('authorName')}
              maxlength={191}
              bind:value={seo.authorName}
            />
          </div>
          <div class="grid gap-2">
            <Label for={id('authorUrl')}>{m.seoAuthorUrl}</Label>
            <Input
              id={id('authorUrl')}
              name={seoField('authorUrl')}
              type="url"
              maxlength={2048}
              bind:value={seo.authorUrl}
            />
          </div>
        </div>
      {:else}
        <!-- Terms keep content-only values untouched. -->
        <input
          type="hidden"
          name={seoField('schemaType')}
          value={seo.schemaType}
        />
        <input
          type="hidden"
          name={seoField('authorName')}
          value={seo.authorName}
        />
        <input
          type="hidden"
          name={seoField('authorUrl')}
          value={seo.authorUrl}
        />
      {/if}
    </div>
  </div>
</details>
