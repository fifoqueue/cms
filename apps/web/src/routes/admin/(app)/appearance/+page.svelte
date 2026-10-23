<script lang="ts">
  import { resolve } from '$app/paths';
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '$app/forms';
  import { ExternalLink, Info, Paintbrush, Upload, X } from '@lucide/svelte';
  import FormMessage from '#lib/admin/FormMessage.svelte';
  import ThemePreview from '#lib/admin/ThemePreview.svelte';
  import { Badge } from '#lib/components/ui/badge/index.js';
  import { Button } from '#lib/components/ui/button/index.js';
  import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
  } from '#lib/components/ui/card/index.js';
  import { Input } from '#lib/components/ui/input/index.js';
  import { useI18n } from '#lib/i18n/index.js';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();

  const i18n = useI18n();
  const m = $derived(i18n.m);

  const themes = $derived(
    [...data.themes].sort(
      (a, b) =>
        Number(b.active) - Number(a.active) ||
        Number(b.builtin) - Number(a.builtin) ||
        a.name.localeCompare(b.name),
    ),
  );

  /** The theme whose details dialog is open. */
  let details = $state<(typeof themes)[number] | null>(null);
  let dialog: HTMLDialogElement;
  const showDetails = (theme: (typeof themes)[number]) => {
    details = theme;
    dialog.showModal();
  };

  const confirmRemove =
    (name: string): SubmitFunction =>
    ({ cancel }) => {
      if (!confirm(m.themeRemoveConfirm(name))) cancel();
    };
</script>

<svelte:head><title>{m.navAppearance}</title></svelte:head>

<div class="flex flex-wrap items-center justify-between gap-4">
  <h1 class="text-2xl font-semibold">{m.navAppearance}</h1>
  <Button href={resolve('/(site)')} variant="outline" target="_blank"
    ><ExternalLink class="size-4" /> {m.viewSite}</Button
  >
</div>
<FormMessage {form} />

<section aria-labelledby="themes-heading" class="space-y-3">
  <h2 id="themes-heading" class="text-lg font-medium">{m.appearanceThemes}</h2>
  <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
    {#each themes as theme (theme.id)}
      <Card class={theme.active ? 'ring-2 ring-primary' : ''}>
        <CardHeader>
          <CardTitle class="flex flex-wrap items-center gap-2">
            {theme.name}
            <span class="text-sm font-normal text-muted-foreground"
              >{theme.version}</span
            >
          </CardTitle>
          <CardDescription>{theme.description || theme.id}</CardDescription>
          {#if theme.author}<p class="text-xs text-muted-foreground">
              {m.themeByAuthor(theme.author)}
            </p>{/if}
          <div class="flex flex-wrap gap-1">
            {#if theme.active}<Badge>{m.themeActive}</Badge>{/if}
            {#if theme.builtin}<Badge variant="secondary">{m.builtin}</Badge
              >{/if}
            {#if theme.customized}<Badge variant="outline"
                >{m.editorCustomized}</Badge
              >{/if}
            <Badge variant="outline"
              >{m.themeTemplateCount(theme.templateCount)}</Badge
            >
          </div>
        </CardHeader>
        <CardContent>
          <button
            type="button"
            class="block w-full rounded-md text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            aria-label={m.themeDetailsOf(theme.name)}
            onclick={() => showDetails(theme)}
          >
            <ThemePreview
              palette={theme.palette}
              name={theme.name}
              screenshot={theme.screenshot}
            />
          </button>
        </CardContent>
        <CardFooter class="mt-auto flex flex-wrap gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onclick={() => showDetails(theme)}
            ><Info class="size-4" /> {m.themeDetails}</Button
          >
          <Button
            href={`${resolve('/admin/(app)/appearance/editor')}?theme=${encodeURIComponent(theme.id)}`}
            variant={theme.active ? 'default' : 'outline'}
            size="sm"><Paintbrush class="size-4" /> {m.themeCustomize}</Button
          >
          {#if theme.active}
            <p class="text-sm text-muted-foreground">{m.themeShown}</p>
          {:else}
            <form method="POST" action="?/activate" use:enhance>
              <input type="hidden" name="id" value={theme.id} />
              <Button type="submit" size="sm">{m.themeActivate}</Button>
            </form>
            {@render livePreview(theme.id)}
            {#if !theme.builtin}
              <form
                method="POST"
                action="?/remove"
                use:enhance={confirmRemove(theme.name)}
              >
                <input type="hidden" name="id" value={theme.id} />
                <Button type="submit" variant="destructive" size="sm"
                  >{m.remove}</Button
                >
              </form>
            {/if}
          {/if}
        </CardFooter>
      </Card>
    {:else}
      <p class="text-muted-foreground">{m.themesEmpty}</p>
    {/each}
  </div>
</section>

{#snippet livePreview(id: string)}
  <!-- Not enhanced: the preview opens the site in a new tab. -->
  <form method="POST" action="?/preview" target="_blank">
    <input type="hidden" name="id" value={id} />
    <Button type="submit" variant="outline" size="sm"
      ><ExternalLink class="size-4" /> {m.themeLivePreview}</Button
    >
  </form>
{/snippet}

<dialog
  bind:this={dialog}
  aria-labelledby="theme-details-title"
  class="m-auto w-[min(42rem,calc(100vw-2rem))] rounded-lg border bg-background p-0 text-foreground shadow-lg backdrop:bg-black/50"
  onclose={() => (details = null)}
>
  {#if details}
    <div class="grid gap-4 p-6">
      <div class="flex items-start justify-between gap-4">
        <div>
          <h2 id="theme-details-title" class="text-lg font-semibold">
            {details.name}
            <span class="text-sm font-normal text-muted-foreground"
              >{details.version}</span
            >
          </h2>
          {#if details.author}<p class="text-sm text-muted-foreground">
              {m.themeByAuthor(details.author)}
            </p>{/if}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={m.close}
          onclick={() => dialog.close()}><X class="size-4" /></Button
        >
      </div>
      <ThemePreview
        palette={details.palette}
        name={details.name}
        screenshot={details.screenshot}
      />
      <p class="text-sm">{details.description || details.id}</p>
      <div class="flex flex-wrap gap-1">
        {#if details.active}<Badge>{m.themeActive}</Badge>{/if}
        {#if details.builtin}<Badge variant="secondary">{m.builtin}</Badge>{/if}
        {#if details.customized}<Badge variant="outline"
            >{m.editorCustomized}</Badge
          >{/if}
        <Badge variant="outline"
          >{m.themeTemplateCount(details.templateCount)}</Badge
        >
      </div>
      <div class="flex flex-wrap gap-2 border-t pt-4">
        <Button
          href={`${resolve('/admin/(app)/appearance/editor')}?theme=${encodeURIComponent(details.id)}`}
          variant="outline"
          size="sm"><Paintbrush class="size-4" /> {m.themeCustomize}</Button
        >
        {#if !details.active}
          <form
            method="POST"
            action="?/activate"
            use:enhance={() =>
              async ({ update }) => {
                dialog.close();
                await update();
              }}
          >
            <input type="hidden" name="id" value={details.id} />
            <Button type="submit" size="sm">{m.themeActivate}</Button>
          </form>
          {@render livePreview(details.id)}
          {#if !details.builtin}
            <form
              method="POST"
              action="?/remove"
              use:enhance={(input) => {
                confirmRemove(details!.name)(input);
                return async ({ update }) => {
                  dialog.close();
                  await update();
                };
              }}
            >
              <input type="hidden" name="id" value={details.id} />
              <Button type="submit" variant="destructive" size="sm"
                >{m.remove}</Button
              >
            </form>
          {/if}
        {/if}
      </div>
    </div>
  {/if}
</dialog>

<Card>
  <CardHeader>
    <CardTitle>{m.themeUpload}</CardTitle>
    <CardDescription>{m.themeUploadHelp}</CardDescription>
  </CardHeader>
  <CardContent>
    <form
      method="POST"
      action="?/install"
      enctype="multipart/form-data"
      use:enhance
      class="flex flex-wrap gap-2"
    >
      <Input
        name="theme"
        type="file"
        accept=".zip,application/zip"
        required
        class="max-w-sm"
        aria-label={m.themeFile}
      />
      <Button type="submit"><Upload class="size-4" /> {m.mediaUpload}</Button>
    </form>
  </CardContent>
</Card>
