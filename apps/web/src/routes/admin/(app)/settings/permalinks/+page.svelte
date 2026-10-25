<script lang="ts">
  import SettingsForm from '#lib/admin/settings/SettingsForm.svelte';
  import {
    MAX_PERMALINK_PATTERN_LENGTH,
    PERMALINK_CONTENT_TYPES,
    permalinkSettingsSchema,
    renderPermalink,
    PERMALINK_TOKENS,
  } from '@cms/sdk';
  import type { PermalinkSettings } from '@cms/sdk';
  import { untrack } from 'svelte';
  import FormMessage from '#lib/admin/FormMessage.svelte';
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
  import { useI18n } from '#lib/i18n/index.js';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();

  const i18n = useI18n();
  const m = $derived(i18n.m);

  const permalinkForm = $derived(form?.intent === 'permalinks' ? form : null);
  const archivesForm = $derived(form?.intent === 'archives' ? form : null);

  // Initial values only (a failed save keeps what was typed); the form owns the state afterwards.
  let links: PermalinkSettings = $state(
    untrack(() => ({
      ...(form && 'permalinks' in form && form.permalinks
        ? form.permalinks
        : data.permalinks),
    })),
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

<svelte:head><title>{m.permalinksTitle}</title></svelte:head>

<Card>
  <CardHeader>
    <CardTitle>{m.permalinksTitle}</CardTitle>
    <CardDescription>
      {m.permalinksHelp}
    </CardDescription>
  </CardHeader>
  <CardContent>
    <SettingsForm action="?/permalinks" class="space-y-4">
      <FormMessage form={permalinkForm} />
      <p class="text-sm text-muted-foreground">
        {m.permalinkTokens}
        <!-- Wraps between tokens on narrow screens (adjacent inline codes have no break point). -->
        <span class="mt-1 flex flex-wrap gap-x-2 gap-y-1">
          {#each PERMALINK_TOKENS as token (token)}<code>%{token}%</code>{/each}
        </span>
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
              <code
                >{renderPermalink(pattern, {
                  ...SAMPLE,
                  timeZone: data.timeZone,
                })}</code
              >
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
    </SettingsForm>
  </CardContent>
</Card>

<Card>
  <CardHeader><CardTitle>{m.archiveBasesTitle}</CardTitle></CardHeader>
  <CardContent>
    <SettingsForm action="?/archives" reset class="space-y-4">
      <FormMessage form={archivesForm} />
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
    </SettingsForm>
  </CardContent>
</Card>
