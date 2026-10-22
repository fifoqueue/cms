<script lang="ts">
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '$app/forms';
  import { resolve } from '$app/paths';
  import {
    MAX_PERMALINK_PATTERN_LENGTH,
    PERMALINK_CONTENT_TYPES,
    formatSeoTitle,
    permalinkSettingsSchema,
    renderPermalink,
    PERMALINK_TOKENS,
  } from '@cms/sdk';
  import type { PermalinkSettings } from '@cms/sdk';
  import {
    CircleAlert,
    CircleCheck,
    CircleMinus,
    ExternalLink,
  } from '@lucide/svelte';
  import FormMessage from '#lib/admin/FormMessage.svelte';
  import type { SeoSettingsFormValues } from '#lib/admin/seo.js';
  import { Button } from '#lib/components/ui/button/index.js';
  import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
  } from '#lib/components/ui/card/index.js';
  import { Input } from '#lib/components/ui/input/index.js';
  import { Label } from '#lib/components/ui/label/index.js';
  import {
    NativeSelect,
    NativeSelectOption,
  } from '#lib/components/ui/native-select/index.js';
  import { Switch } from '#lib/components/ui/switch/index.js';
  import { Textarea } from '#lib/components/ui/textarea/index.js';
  import { useI18n } from '#lib/i18n/index.js';
  import { untrack } from 'svelte';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();

  const i18n = useI18n();
  const m = $derived(i18n.m);

  const settingsForm = $derived(form?.intent === 'settings' ? form : null);
  const permalinkForm = $derived(form?.intent === 'permalinks' ? form : null);

  // Initial values only (a failed save keeps what was typed); the forms own the state afterwards.
  let values: SeoSettingsFormValues = $state(
    untrack(() => ({
      ...(form && 'values' in form && form.values
        ? form.values
        : data.settings),
    })),
  );
  let links: PermalinkSettings = $state(
    untrack(() => ({
      ...(form && 'permalinks' in form && form.permalinks
        ? form.permalinks
        : data.permalinks),
    })),
  );

  /** The on/off settings. */
  type Flag = {
    [K in keyof SeoSettingsFormValues]: SeoSettingsFormValues[K] extends boolean
      ? K
      : never;
  }[keyof SeoSettingsFormValues];

  const keep: SubmitFunction =
    () =>
    ({ update }) =>
      update({ reset: false });

  // Readiness reflects what is saved, not what is being typed.
  const saved = $derived(data.settings);
  const published = $derived(data.published);

  interface Status {
    label: string;
    state: 'ok' | 'attention' | 'off';
    detail: string;
  }

  const readiness = $derived.by((): Status[] => {
    const codes = [saved.googleVerification, saved.bingVerification].filter(
      Boolean,
    ).length;
    return [
      saved.siteUrl
        ? { label: m.seoSiteUrl, state: 'ok', detail: saved.siteUrl }
        : {
            label: m.seoSiteUrl,
            state: 'attention',
            detail: m.seoSiteUrlMissing,
          },
      saved.indexingEnabled
        ? {
            label: m.seoIndexing,
            state: 'ok',
            detail: m.seoIndexingOn,
          }
        : {
            label: m.seoIndexing,
            state: 'attention',
            detail: m.seoIndexingOff,
          },
      saved.defaultImageUrl
        ? {
            label: m.seoDefaultImage,
            state: 'ok',
            detail: saved.defaultImageAlt
              ? m.seoDefaultImageWithAlt
              : m.seoDefaultImageWithoutAlt,
          }
        : {
            label: m.seoDefaultImage,
            state: 'attention',
            detail: m.seoDefaultImageMissing,
          },
      saved.entityName
        ? {
            label: m.seoIdentity,
            state: 'ok',
            detail: `${saved.entityType}: ${saved.entityName}`,
          }
        : {
            label: m.seoIdentity,
            state: 'attention',
            detail: m.seoIdentityMissing,
          },
      {
        label: m.seoVerificationCodes,
        state: codes ? 'ok' : 'off',
        detail: codes ? m.seoCodesConfigured(codes) : m.seoCodesNone,
      },
      {
        label: m.seoSitemap,
        state: published.sitemap ? 'ok' : 'off',
        detail: published.sitemap
          ? m.seoPublished
          : saved.indexingEnabled
            ? m.seoNeedsSiteUrl
            : m.seoNeedsIndexing,
      },
      {
        label: m.seoAiSearch,
        state: saved.indexingEnabled && saved.allowAiSearch ? 'ok' : 'off',
        detail: !saved.indexingEnabled
          ? m.seoAiIndexingOff
          : saved.allowAiSearch
            ? m.seoAiSearchAllowed
            : m.seoAiSearchBlocked,
      },
      {
        label: m.seoAiTraining,
        state: saved.indexingEnabled && saved.allowAiTraining ? 'ok' : 'off',
        detail: !saved.indexingEnabled
          ? m.seoAiIndexingOff
          : saved.allowAiTraining
            ? m.seoAiTrainingAllowed
            : m.seoAiTrainingBlocked,
      },
      {
        label: 'llms.txt',
        state: published.llms ? 'ok' : 'off',
        detail: published.llms
          ? m.seoPublished
          : !saved.llmsTxtEnabled
            ? m.seoTurnedOff
            : !saved.indexingEnabled
              ? m.seoNeedsIndexing
              : m.seoNeedsSiteUrl,
      },
    ];
  });

  const discovery = $derived([
    { href: resolve('/robots.txt'), label: 'robots.txt' },
    { href: resolve('/sitemap.xml'), label: m.seoSitemap },
    { href: resolve('/feed.xml'), label: m.seoFeed },
    { href: resolve('/llms.txt'), label: 'llms.txt' },
  ]);

  const homeTitle = $derived(values.homeTitle.trim() || data.siteTitle);
  const titleExample = $derived(
    formatSeoTitle(m.seoExampleTitle, data.siteTitle, values.titleTemplate),
  );

  /** A fixed sample entry, labelled as such: previews never show real content. */
  const SAMPLE = {
    id: 'a1b2c3d4',
    slug: 'hello-world',
    title: 'Hello world',
    publishedAt: '2026-10-22T09:00:00.000Z',
    createdAt: '2026-10-22T09:00:00.000Z',
  };

  const linkIssues = $derived.by(() => {
    const result = permalinkSettingsSchema.safeParse(
      Object.fromEntries(Object.entries(links).filter(([, value]) => value)),
    );
    const issues: Partial<Record<string, string>> = {};
    for (const issue of result.error?.issues ?? [])
      issues[String(issue.path[0] ?? '')] = issue.message;
    return issues;
  });

  /** Without a slug, id or title, entries published on the same day share one address. */
  const dateOnly = (pattern: string) =>
    !/%(?:slug|id|title|postname|post_id|pagename)%/.test(pattern);
</script>

{#snippet toggle(name: Flag, label: string, hint?: string)}
  <div class="flex items-start gap-3">
    <Switch id={name} {name} class="mt-0.5" bind:checked={values[name]} />
    <div class="grid gap-1">
      <Label for={name}>{label}</Label>
      {#if hint}<p class="text-xs text-muted-foreground">{hint}</p>{/if}
    </div>
  </div>
{/snippet}

<svelte:head><title>SEO</title></svelte:head>

<div class="flex flex-wrap items-baseline justify-between gap-2">
  <h1 class="text-2xl font-semibold">SEO</h1>
  <p class="text-sm text-muted-foreground">
    {m.seoIntro}
  </p>
</div>

<Card>
  <CardHeader>
    <CardTitle>{m.seoSetup}</CardTitle>
    <CardDescription>{m.seoSetupHelp}</CardDescription>
  </CardHeader>
  <CardContent class="space-y-4">
    <ul class="grid gap-3 sm:grid-cols-2">
      {#each readiness as item (item.label)}
        <li class="flex items-start gap-2 text-sm">
          {#if item.state === 'ok'}
            <CircleCheck class="mt-0.5 size-4 shrink-0 text-emerald-600" />
          {:else if item.state === 'attention'}
            <CircleAlert class="mt-0.5 size-4 shrink-0 text-amber-600" />
          {:else}
            <CircleMinus class="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          {/if}
          <span>
            <span class="font-medium">{item.label}</span>
            <span class="block break-all text-muted-foreground"
              >{item.detail}</span
            >
          </span>
        </li>
      {/each}
    </ul>
    <div class="flex flex-wrap gap-2">
      {#each discovery as link (link.href)}
        <Button
          href={link.href}
          rel="external"
          target="_blank"
          variant="outline"
          size="sm"><ExternalLink class="size-4" /> {link.label}</Button
        >
      {/each}
    </div>
  </CardContent>
</Card>

<form method="POST" action="?/settings" use:enhance={keep} class="space-y-6">
  <FormMessage form={settingsForm} />

  <Card>
    <CardHeader>
      <CardTitle>{m.seoIdentityTitle}</CardTitle>
    </CardHeader>
    <CardContent class="space-y-4">
      <div class="grid gap-2">
        <Label for="siteUrl">{m.seoSiteUrl}</Label>
        <Input
          id="siteUrl"
          name="siteUrl"
          type="url"
          maxlength={2048}
          placeholder="https://example.com"
          bind:value={values.siteUrl}
        />
        <p class="text-xs text-muted-foreground">
          {m.seoSiteUrlHelp}
        </p>
      </div>
      <div class="grid gap-2">
        <Label for="titleTemplate">{m.seoTitleTemplate}</Label>
        <Input
          id="titleTemplate"
          name="titleTemplate"
          required
          maxlength={200}
          bind:value={values.titleTemplate}
        />
        <p class="text-xs text-muted-foreground">
          {m.seoTitleTemplateHelp(titleExample)}
        </p>
      </div>
      <div class="grid gap-4 sm:grid-cols-2">
        <div class="grid gap-2">
          <Label for="homeTitle">{m.seoHomeTitle}</Label>
          <Input
            id="homeTitle"
            name="homeTitle"
            maxlength={200}
            placeholder={data.siteTitle}
            bind:value={values.homeTitle}
          />
          <p class="text-xs text-muted-foreground">{m.seoShownAs(homeTitle)}</p>
        </div>
        <div class="grid gap-2">
          <Label for="homeDescription">{m.seoHomeDescription}</Label>
          <Textarea
            id="homeDescription"
            name="homeDescription"
            maxlength={500}
            rows={2}
            bind:value={values.homeDescription}
          />
        </div>
      </div>
      <div class="grid gap-4 sm:grid-cols-2">
        <div class="grid gap-2">
          <Label for="entityType">{m.seoEntityType}</Label>
          <NativeSelect
            id="entityType"
            name="entityType"
            class="w-full"
            bind:value={values.entityType}
          >
            <NativeSelectOption value="Organization"
              >{m.seoOrganization}</NativeSelectOption
            >
            <NativeSelectOption value="Person">{m.seoPerson}</NativeSelectOption
            >
          </NativeSelect>
        </div>
        <div class="grid gap-2">
          <Label for="entityName">{m.name}</Label>
          <Input
            id="entityName"
            name="entityName"
            maxlength={191}
            bind:value={values.entityName}
          />
        </div>
        <div class="grid gap-2">
          <Label for="logoUrl">{m.seoLogoUrl}</Label>
          <Input
            id="logoUrl"
            name="logoUrl"
            type="url"
            maxlength={2048}
            bind:value={values.logoUrl}
          />
        </div>
        <div class="grid gap-2">
          <Label for="twitterHandle">{m.seoTwitterHandle}</Label>
          <Input
            id="twitterHandle"
            name="twitterHandle"
            placeholder="@example"
            maxlength={16}
            bind:value={values.twitterHandle}
          />
        </div>
      </div>
      <div class="grid gap-2">
        <Label for="sameAs">{m.seoProfiles}</Label>
        <Textarea
          id="sameAs"
          name="sameAs"
          rows={3}
          placeholder="https://social.example/@you"
          bind:value={values.sameAs}
        />
        <p class="text-xs text-muted-foreground">
          {m.seoProfilesHelp}
        </p>
      </div>
    </CardContent>
  </Card>

  <Card>
    <CardHeader>
      <CardTitle>{m.seoDefaultImage}</CardTitle>
      <CardDescription>{m.seoDefaultImageHelp}</CardDescription>
    </CardHeader>
    <CardContent class="grid gap-4 sm:grid-cols-2">
      <div class="grid gap-2">
        <Label for="defaultImageUrl">{m.seoImageUrl}</Label>
        <Input
          id="defaultImageUrl"
          name="defaultImageUrl"
          type="url"
          maxlength={2048}
          bind:value={values.defaultImageUrl}
        />
      </div>
      <div class="grid gap-2">
        <Label for="defaultImageAlt">{m.seoImageAlt}</Label>
        <Input
          id="defaultImageAlt"
          name="defaultImageAlt"
          maxlength={500}
          bind:value={values.defaultImageAlt}
        />
      </div>
    </CardContent>
  </Card>

  <Card>
    <CardHeader>
      <CardTitle>{m.seoSearchEngines}</CardTitle>
    </CardHeader>
    <CardContent class="space-y-4">
      {@render toggle(
        'indexingEnabled',
        m.seoIndexingToggle,
        m.seoIndexingToggleHelp,
      )}
      {@render toggle('indexCategories', m.seoIndexCategories)}
      {@render toggle('indexTags', m.seoIndexTags)}
      <div class="grid gap-4 sm:grid-cols-3">
        <div class="grid gap-2">
          <Label for="maxSnippet">{m.seoMaxSnippet}</Label>
          <Input
            id="maxSnippet"
            name="maxSnippet"
            type="number"
            min={-1}
            max={10000}
            bind:value={values.maxSnippet}
          />
          <p class="text-xs text-muted-foreground">
            {m.seoMaxSnippetHelp}
          </p>
        </div>
        <div class="grid gap-2">
          <Label for="maxImagePreview">{m.seoImagePreviews}</Label>
          <NativeSelect
            id="maxImagePreview"
            name="maxImagePreview"
            class="w-full"
            bind:value={values.maxImagePreview}
          >
            <NativeSelectOption value="large"
              >{m.seoPreviewLarge}</NativeSelectOption
            >
            <NativeSelectOption value="standard"
              >{m.seoPreviewStandard}</NativeSelectOption
            >
            <NativeSelectOption value="none">{m.none}</NativeSelectOption>
          </NativeSelect>
        </div>
        <div class="grid gap-2">
          <Label for="maxVideoPreview">{m.seoMaxVideoPreview}</Label>
          <Input
            id="maxVideoPreview"
            name="maxVideoPreview"
            type="number"
            min={-1}
            max={86400}
            bind:value={values.maxVideoPreview}
          />
          <p class="text-xs text-muted-foreground">
            {m.seoMaxVideoPreviewHelp}
          </p>
        </div>
      </div>
    </CardContent>
  </Card>

  <Card>
    <CardHeader>
      <CardTitle>{m.seoVerification}</CardTitle>
      <CardDescription>
        {m.seoVerificationHelp}
      </CardDescription>
    </CardHeader>
    <CardContent class="grid gap-4 sm:grid-cols-2">
      <div class="grid gap-2">
        <Label for="googleVerification">Google Search Console</Label>
        <Input
          id="googleVerification"
          name="googleVerification"
          maxlength={255}
          autocomplete="off"
          bind:value={values.googleVerification}
        />
      </div>
      <div class="grid gap-2">
        <Label for="bingVerification">Bing Webmaster Tools</Label>
        <Input
          id="bingVerification"
          name="bingVerification"
          maxlength={255}
          autocomplete="off"
          bind:value={values.bingVerification}
        />
      </div>
    </CardContent>
  </Card>

  <Card>
    <CardHeader>
      <CardTitle>{m.seoAiTools}</CardTitle>
      <CardDescription>
        {m.seoAiToolsHelp}
      </CardDescription>
    </CardHeader>
    <CardContent class="space-y-4">
      {@render toggle(
        'allowAiSearch',
        m.seoAllowAiSearch,
        m.seoAllowAiSearchHelp,
      )}
      {@render toggle(
        'allowAiTraining',
        m.seoAllowAiTraining,
        m.seoAllowAiTrainingHelp,
      )}
      {@render toggle('llmsTxtEnabled', m.seoLlmsToggle, m.seoLlmsToggleHelp)}
      <div class="grid gap-2">
        <Label for="llmsIntro">{m.seoLlmsIntro}</Label>
        <Textarea
          id="llmsIntro"
          name="llmsIntro"
          maxlength={2000}
          rows={3}
          bind:value={values.llmsIntro}
        />
      </div>
    </CardContent>
  </Card>

  <Button type="submit">{m.seoSave}</Button>
</form>

<Card>
  <CardHeader>
    <CardTitle>{m.permalinksTitle}</CardTitle>
    <CardDescription>
      {m.permalinksHelp}
    </CardDescription>
  </CardHeader>
  <CardContent>
    <form
      method="POST"
      action="?/permalinks"
      use:enhance={keep}
      class="space-y-4"
    >
      <FormMessage form={permalinkForm} />
      <p class="text-sm text-muted-foreground">
        {m.permalinkTokens}
        {#each PERMALINK_TOKENS as token (token)}<code class="mr-2"
            >%{token}%</code
          >{/each}
        {m.permalinkDates}
      </p>
      {#each data.types as { key: type, pluralName } (type)}
        {@const issue = linkIssues[type]}
        {@const builtin = (
          PERMALINK_CONTENT_TYPES as readonly string[]
        ).includes(type)}
        {@const pattern = links[type] || `/${type}/%slug%`}
        <div class="grid gap-2">
          <Label for="permalink-{type}">{pluralName}</Label>
          <select
            aria-label={m.permalinkPreset}
            class="rounded border bg-background px-3 py-2"
            value=""
            onchange={(event) => {
              if (event.currentTarget.value)
                links[type] = event.currentTarget.value;
            }}
          >
            <option value="">{m.permalinkCustom}</option>
            <option value="/%postname%/">{m.permalinkPostName}</option>
            <option value="/%year%/%monthnum%/%day%/%postname%/"
              >{m.permalinkDayName}</option
            >
            <option value="/%year%/%monthnum%/%postname%/"
              >{m.permalinkMonthName}</option
            >
            <option value="/archives/%post_id%">{m.permalinkId}</option>
            <option value="/%category%/%postname%/"
              >{m.permalinkCategoryName}</option
            >
            {#if type === 'page'}<option value="/%pagename%/"
                >{m.permalinkPageHierarchy}</option
              >{/if}
          </select>
          <Input
            id="permalink-{type}"
            name={type}
            required={builtin}
            placeholder={builtin ? undefined : `/${type}/%slug%`}
            maxlength={MAX_PERMALINK_PATTERN_LENGTH}
            aria-invalid={issue ? 'true' : undefined}
            bind:value={links[type]}
          />
          {#if issue}
            <p class="text-xs text-destructive">{issue}</p>
          {:else}
            <p class="text-xs text-muted-foreground">
              {m.permalinkExample(SAMPLE.title)}
              <code>{renderPermalink(pattern, SAMPLE)}</code>
            </p>
            {#if dateOnly(pattern)}
              <p class="text-xs text-amber-700 dark:text-amber-400">
                {m.permalinkDateOnly}
              </p>
            {:else if !/%(?:slug|id|postname|post_id|pagename)%/.test(pattern)}
              <p class="text-xs text-muted-foreground">
                {m.permalinkSameTitle}
              </p>
            {/if}
          {/if}
        </div>
      {/each}
      <Button type="submit">{m.permalinksSave}</Button>
    </form>
  </CardContent>
</Card>

<Card>
  <CardHeader><CardTitle>{m.archiveBasesTitle}</CardTitle></CardHeader>
  <CardContent>
    <form method="POST" action="?/archives" use:enhance class="space-y-4">
      <p class="text-sm text-muted-foreground">{m.archiveBasesHelp}</p>
      <label class="grid gap-2"
        >{m.columnCategories}<Input
          name="category"
          value={data.archives.bases.category}
          required
        /></label
      >
      <label class="grid gap-2"
        >{m.columnTags}<Input
          name="tag"
          value={data.archives.bases.tag}
          required
        /></label
      >
      <Button type="submit">{m.save}</Button>
    </form>
  </CardContent>
</Card>
