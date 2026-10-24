<script lang="ts">
  import SettingsForm from '#lib/admin/settings/SettingsForm.svelte';
  import PageOptions from '#lib/admin/settings/PageOptions.svelte';
  import FormMessage from '#lib/admin/FormMessage.svelte';
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
  import { useI18n } from '#lib/i18n/index.js';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();

  const i18n = useI18n();
  const m = $derived(i18n.m);
  // svelte-ignore state_referenced_locally
  let frontPage = $state(data.reading.frontPage);
</script>

<svelte:head><title>{m.settingsReading}</title></svelte:head>

<FormMessage {form} />

<Card>
  <CardHeader><CardTitle>{m.settingsReading}</CardTitle></CardHeader>
  <CardContent>
    <SettingsForm action="?/save" class="grid gap-6">
      <fieldset class="grid gap-3">
        <legend class="mb-2 text-sm font-medium">{m.readingFrontPage}</legend>
        <label class="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="frontPage"
            value="posts"
            bind:group={frontPage}
          />
          {m.readingLatestPosts}
        </label>
        <label class="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="frontPage"
            value="page"
            bind:group={frontPage}
          />
          {m.readingStaticPage}
        </label>
        {#if frontPage === 'page'}
          <div class="grid gap-4 pl-6 sm:grid-cols-2">
            <div class="grid gap-2">
              <Label for="frontPageId">{m.readingHomePage}</Label>
              <NativeSelect
                class="w-full"
                id="frontPageId"
                name="frontPageId"
                value={data.reading.frontPageId ?? ''}
              >
                <PageOptions pages={data.pages} empty={m.noChoice} />
              </NativeSelect>
            </div>
            <div class="grid gap-2">
              <Label for="postsPageId">{m.readingPostsPage}</Label>
              <NativeSelect
                class="w-full"
                id="postsPageId"
                name="postsPageId"
                value={data.reading.postsPageId ?? ''}
              >
                <PageOptions pages={data.pages} empty={m.noChoice} />
              </NativeSelect>
            </div>
          </div>
        {:else}
          <input
            type="hidden"
            name="frontPageId"
            value={data.reading.frontPageId ?? ''}
          />
          <input
            type="hidden"
            name="postsPageId"
            value={data.reading.postsPageId ?? ''}
          />
        {/if}
      </fieldset>

      <div class="grid gap-4 sm:grid-cols-2">
        <div class="grid gap-2">
          <Label for="postsPerPage">{m.readingPostsPerPage}</Label>
          <Input
            id="postsPerPage"
            name="postsPerPage"
            type="number"
            min={1}
            max={100}
            value={data.reading.postsPerPage}
          />
        </div>
        <div class="grid gap-2">
          <Label for="feedItems">{m.readingFeedItems}</Label>
          <Input
            id="feedItems"
            name="feedItems"
            type="number"
            min={1}
            max={100}
            value={data.reading.feedItems}
          />
        </div>
        <div class="grid gap-2">
          <Label for="feedContent">{m.readingFeedContent}</Label>
          <NativeSelect
            class="w-full"
            id="feedContent"
            name="feedContent"
            value={data.reading.feedContent}
          >
            <NativeSelectOption value="full"
              >{m.readingFeedFull}</NativeSelectOption
            >
            <NativeSelectOption value="excerpt"
              >{m.readingFeedExcerpt}</NativeSelectOption
            >
          </NativeSelect>
        </div>
        <div class="grid gap-2">
          <Label for="cacheSeconds">{m.readingCacheSeconds}</Label>
          <Input
            id="cacheSeconds"
            name="cacheSeconds"
            type="number"
            min={0}
            max={3600}
            value={data.reading.cacheSeconds}
          />
          <p class="text-xs text-muted-foreground">{m.readingCacheHelp}</p>
        </div>
      </div>
      <div><Button type="submit">{m.save}</Button></div>
    </SettingsForm>
  </CardContent>
</Card>
